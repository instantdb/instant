(ns instant.reactive.aggregator
  (:require
   [clojure.core.async :as a]
   [clojure.core.cache.wrapped :as cache]
   [instant.config :as config]
   [instant.db.attr-sketch :as cms]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.copy :as copy]
   [instant.jdbc.wal :as wal]
   [instant.util.async :as ua]
   [instant.util.json :refer [<-json]]
   [instant.util.tracer :as tracer])
  (:import
   (com.fasterxml.jackson.core.exc StreamConstraintsException)
   (org.postgresql.jdbc PgConnection)
   (org.postgresql.replication LogSequenceNumber)))

(declare shutdown)

;; --------------
;; Initialization

(def triples-copy-sql "copy (select app_id, attr_id, value, checked_data_type from triples) to stdout with (format binary)")

(defn construct-initial-sketches
  "Fetches all triples from the database and generates an attr-sketch
   for each attr. Meant to be used once when bootstrapping the attr sketches."
  [^PgConnection connection copy-sql]
  (let [reducer (copy/copy-reducer connection
                                   copy-sql
                                   [{:name :app-id
                                     :pgtype "uuid"}
                                    {:name :attr-id
                                     :pgtype "uuid"}
                                    {:name :value
                                     :pgtype "jsonb"}
                                    {:name :checked-data-type
                                     :pgtype "checked_data_type"}]
                                   {:handle-json-parse-error (fn [e]
                                                               ;; Replace objects that are too large to read
                                                               ;; with an empty object. That will keep it out
                                                               ;; of the bins, but keep it in the total.
                                                               (if (instance? StreamConstraintsException e)
                                                                 {}
                                                                 (throw e)))})
        base-sketch (cms/make-sketch)

        collect-changes (fn [batch]
                          (reduce (fn [acc row]
                                    (let [key (select-keys row [:app-id :attr-id])
                                          record (select-keys row [:value :checked-data-type])]
                                      (update-in acc [key record] (fnil inc 0))))
                                  {}
                                  batch))
        {sketches-by-key :sketches}
        (transduce
          ;; Take 1M triples at a time
          (partition-all 1000000)
          (completing (fn [{:keys [sketches triple-count]} batch]
                        ;; Group them into batches by app-id and attr-id
                        (tracer/with-span! {:name "aggregator/initial-sketch-batch"}
                          (let [triple-total (+ triple-count (count batch))
                                changes (collect-changes batch)

                                sketches
                                ;; Update each sketch in a single batch-add
                                (reduce-kv (fn [sketches k batch]
                                             (update sketches k (fnil cms/add-batch base-sketch) batch))
                                           sketches
                                           changes)
                                res {:sketches sketches
                                     :triple-count triple-total}]
                            (tracer/add-data! {:attributes {:sketch-count (count sketches)
                                                            :triple-count triple-total}})
                            res))))
          {:sketches {}
           :triple-count 0}
          reducer)]
    (reduce-kv (fn [acc key sketch]
                 (conj acc (assoc key :sketch sketch)))
               []
               sketches-by-key)))

(defn initialize-slot
  "Called on startup, will initialize the permanent aggregation slot and update
   all of the attr sketches with the data up to the slot's snapshot.

   Does nothing if the slot has already been created."
  [{:keys [slot-name copy-sql process-id]}]
  (tracer/with-span! {:name "aggregator/initialize-slot"}
    (when-let [{:keys [connection lsn]}
               (wal/create-sync-db-replication-slot-and-connection
                 (config/get-aurora-config)
                 slot-name)]
      (let [sketches (tracer/with-span! {:name "aggregator/construct-initial-sketches"}
                       (with-open [connection ^PgConnection connection]
                         (construct-initial-sketches connection copy-sql)))
            _ (tracer/with-span! {:name "aggregator/insert-initial-sketches"}
                (doseq [group (partition-all 1000 sketches)]
                  (cms/insert-initial-sketches! (aurora/conn-pool :write)
                                                {:sketches group
                                                 :lsn lsn})))
            wal-status (cms/initialize-wal-aggregator-status (aurora/conn-pool :write)
                                                             {:lsn lsn
                                                              :process-id process-id
                                                              :slot-name slot-name})]
        (when (not= (:lsn wal-status) lsn)
          (throw (ex-info "Invalid lsn from wal-status" {:expected lsn
                                                         :actual (:lsn wal-status)
                                                         :wal-status wal-status})))))))

;; -------------
;; wal record xf

(defn get-triples-data [columns]
  (reduce (fn [data {:keys [name value]}]
            (case name
              "app_id" (assoc data :app-id (parse-uuid value))
              "attr_id" (assoc data :attr-id (parse-uuid value))
              "value" (assoc data :value (<-json value))
              "checked_data_type" (assoc data :checked-data-type (keyword value))
              data))
          {}
          columns))

;; Used by tests so that we can prevent the aggregator
;; from overwriting data in the tests
(def test-filter identity)

(defn transform-wal-record
  "Extracts triples changes from the wal that would affect the sketch.

   Returns a list of (possibly empty) changes and the lsn."
  [{:keys [changes nextlsn] :as _record}]
  (let [sketch-changes
        (test-filter
          (reduce
            (fn [acc change]
              (if (not= "triples" (:table change))
                acc
                (let [lsn (LogSequenceNumber/valueOf ^String (:lsn change))]
                  (case (:action change)
                    :insert
                    (conj acc {:incr 1
                               :lsn lsn
                               :triples-data (get-triples-data (:columns change))})

                    :delete
                    (conj acc {:incr -1
                               :lsn lsn
                               :triples-data (get-triples-data (:identity change))})

                    :update
                    (let [update-data (get-triples-data (:columns change))]
                      (if-not (contains? update-data :value)
                        ;; The triple was updated, but not the value field.
                        ;; We should ignore this change.
                        acc
                        (conj acc
                              ;; Remove the old
                              {:incr -1
                               :lsn lsn
                               :triples-data (get-triples-data (:identity change))}
                              ;; Add the new
                              {:incr 1
                               :lsn lsn
                               :triples-data update-data})))))))
            []
            changes))]
    (when (seq sketch-changes)
      {:sketch-changes sketch-changes
       :lsn nextlsn})))

(defn wal-record-xf []
  (keep #'transform-wal-record))

;; ----------
;; aggregator

(defn max-lsn ^LogSequenceNumber
  [^LogSequenceNumber a ^LogSequenceNumber b]
  (cond (not a)
        b

        (not b)
        a

        :else
        (case (compare a b)
          0 a
          -1 b
          1 a)))

(defn combine-sketch-changes [{:keys [changes]}
                              {:keys [sketch-changes lsn]}]
  {:max-lsn lsn
   :changes (reduce (fn [acc {:keys [incr triples-data lsn]}]
                      (let [key {:app-id (:app-id triples-data)
                                 :attr-id (:attr-id triples-data)}
                            record {:value (:value triples-data)
                                    :checked-data-type (:checked-data-type triples-data)}]
                        (-> acc
                            (update-in [key :records record] (fnil + 0) incr)
                            (update-in [key :max-lsn] max-lsn lsn))))
                    changes
                    sketch-changes)})

(defn process-sketch-changes [conn {:keys [process-id slot-name previous-lsn
                                           max-lsn changes sketch-cache]}]
  (tracer/with-span! {:name "aggregator/process-sketch-changes"
                      :attributes {:previous-lsn previous-lsn
                                   :changed-sketch-count (count changes)
                                   :max-lsn max-lsn}}
    (when-not max-lsn
      (throw (ex-info "max-lsn was nil, we can't apply changes" {:previous-lsn previous-lsn
                                                                 :max-lsn max-lsn})))
    (let [{:keys [cached-sketches remaining-keys]}
          (reduce (fn [acc k]
                    (if-let [cached (cache/lookup sketch-cache k)]
                      (-> acc
                          (assoc-in [:cached-sketches k] cached))
                      (update acc :remaining-keys conj k)))
                  {:cached-sketches {}
                   :remaining-keys #{}}
                  (keys changes))
          _ (tracer/add-data! {:attributes {:cached-count (count cached-sketches)}})
          sketches (merge cached-sketches
                          (when (seq remaining-keys)
                            (cms/find-or-create-sketches! conn remaining-keys)))
          ;; Tracks how many attrs were deleted before we could save them
          _ (tracer/add-data! {:attributes {:deleted-count (- (count changes)
                                                              (count sketches))}})
          sketches (reduce-kv
                     (fn [acc k {:keys [records max-lsn]}]
                       ;; attr may have been deleted in the interim
                       (if-let [sketch (get sketches k)]
                         (conj acc (-> sketch
                                       (update :sketch cms/add-batch records)
                                       (assoc :max-lsn max-lsn)))
                         acc))
                     []
                     changes)]
      (doseq [sketch sketches
              :let [k (select-keys sketch [:app-id :attr-id])]]
        (cache/miss sketch-cache k sketch))
      (cms/save-sketches! conn {:sketches sketches
                                :previous-lsn previous-lsn
                                :lsn max-lsn
                                :slot-name slot-name
                                :process-id process-id}))))

(defn start-worker
  "Returns a shutdown function. The shutdown function returns a channel that
   will close when shutdown is finished."
  [{:keys [wal-chan sketch-flush-ms sketch-flush-max-items close-signal-chan
           start-lsn flush-lsn-chan on-error slot-name process-id]}]

  ;; sketch cache should live here
  (let [sketch-cache (cache/lru-cache-factory {} :threshold 4092)
        process-chan (ua/chunked-chan {:flush-ms sketch-flush-ms
                                       :max-size sketch-flush-max-items
                                       :combine combine-sketch-changes
                                       :init nil
                                       :size (fn [{:keys [sketch-changes]}]
                                               (count sketch-changes))})

        shuffler
        ;; Shuffles items from the wal-chan to the process-chan, where they are
        ;; combined with combine-sketch-changes
        (a/go
          (try
            (loop []
              (when-some [wal-record (a/<! wal-chan)]
                (ua/>!-close-safe close-signal-chan (:in process-chan) wal-record)
                (recur)))
            (tracer/record-info! {:name "aggregator-worker/shuffler-shutdown"})
            (catch Throwable t
              (on-error t)
              (tracer/record-exception-span! t {:name "aggregator-worker/shuffler-error"}))))

        ;; Processes the items every N seconds (or M items) in a batch
        processor
        (a/go
          (try
            (loop [previous-lsn start-lsn]
              (when-some [{:keys [changes max-lsn]} (a/<! (:out process-chan))]
                (let [{:keys [lsn]} (process-sketch-changes (aurora/conn-pool :write)
                                                            {:process-id process-id
                                                             :slot-name slot-name
                                                             :previous-lsn previous-lsn
                                                             :max-lsn max-lsn
                                                             :changes changes
                                                             :sketch-cache sketch-cache})]
                  (ua/>!-close-safe close-signal-chan flush-lsn-chan lsn)
                  (recur lsn))))
            (tracer/record-info! {:name "aggregator-worker/processor-shutdown"})
            (catch Throwable t
              (on-error t)
              (tracer/record-exception-span! t {:name "aggregator-worker/processor-error"}))))]
    (fn []
      (let [shutdown-finished ((:shutdown process-chan))]
        (a/go
          (a/<! shutdown-finished)
          (a/<! shuffler)
          (a/<! processor))))))

;; -------------
;; orchestration

(defn create-wal-chans []
  (let [chan (a/chan 1 (wal-record-xf))]
    {:wal-chan chan
     :close-signal-chan (a/chan)
     :worker-chan chan
     :flush-lsn-chan (a/chan (a/sliding-buffer 1))}))

(defn stop [wal-opts]
  (let [shutdown-future (future (wal/shutdown! wal-opts))]
    (loop []
      (when-not (realized? shutdown-future)
        (wal/kick-wal (aurora/conn-pool :write))
        (Thread/sleep 100)
        (recur))))
  (a/close! (:to wal-opts))
  (a/close! (:close-signal-chan wal-opts))
  (a/close! (:flush-lsn-chan wal-opts))
  (a/close! (:worker-chan wal-opts)))

(def slot-type :aggregator)

(defn start-slot-listener
  "Starts process that will try to acquire the aggregation wal slot every
  `acquire-slot-interval-ms`.

  If it acquires the slot, will listen to changes from the wal and flush the
  changes to the db every `sketch-flush-ms` or after receiving more than
  `sketch-flush-max-items` records.

  Returns a function to shut down the listener."
  [{:keys [slot-suffix
           acquire-slot-interval-ms
           sketch-flush-ms
           sketch-flush-max-items
           process-id]}]
  (let [shutdown-chan (a/chan)
        process
        (a/go
          (loop [timeout-ch (a/timeout 0)]
            (when (= timeout-ch (second (a/alts! [shutdown-chan timeout-ch])))
              (if-let [lsn (cms/get-start-lsn (aurora/conn-pool :read)
                                              {:slot-name (wal/full-slot-name slot-type
                                                                              slot-suffix)})]
                (let [{:keys [wal-chan worker-chan flush-lsn-chan close-signal-chan]}
                      (create-wal-chans)

                      wal-opts (wal/make-wal-opts
                                 {:wal-chan wal-chan
                                  :worker-chan worker-chan
                                  :close-signal-chan close-signal-chan
                                  :flush-lsn-chan flush-lsn-chan
                                  :get-conn-config (fn []
                                                     (or (config/get-next-aurora-config)
                                                         ;; Use the next db so that we don't
                                                         ;; have to worry about restarting the
                                                         ;; aggregator when failing over to a
                                                         ;; new blue/green deployment
                                                         (config/get-aurora-config)))
                                  :slot-suffix slot-suffix
                                  :slot-type slot-type
                                  :lsn lsn})

                      wal-started-promise (:started-promise wal-opts)
                      signal-chan (a/chan)
                      wal-worker (ua/fut-bg
                                   (try
                                     (wal/start-aggregator-worker wal-opts)
                                     (finally
                                       (deliver wal-started-promise :recur)
                                       (a/close! close-signal-chan))))

                      ;; Wait for the wal worker to potentially claim the slot
                      _ (ua/vfuture
                          (let [wal-start-result @wal-started-promise]
                            (case wal-start-result
                              :recur (a/put! signal-chan :recur)
                              true (a/put! signal-chan :slot-claimed))))

                      [next-v _next-ch] (a/alts! [signal-chan shutdown-chan])]

                  (case next-v
                    nil ;; shutdown
                    (do (stop wal-opts)
                        wal-worker)

                    :recur ;; we didn't get the slot, wait and try again
                    (recur (a/timeout acquire-slot-interval-ms))

                    :slot-claimed ;; we got the slot, start the worker
                    (let [stop-worker (start-worker {:wal-chan worker-chan
                                                     :close-signal-chan close-signal-chan
                                                     :flush-lsn-chan flush-lsn-chan
                                                     :slot-name (:slot-name wal-opts)
                                                     :process-id process-id
                                                     :start-lsn lsn
                                                     :sketch-flush-ms sketch-flush-ms
                                                     :sketch-flush-max-items sketch-flush-max-items
                                                     :on-error (fn [_t]
                                                                 (a/close! close-signal-chan))})
                          [_exit-v exit-ch] (a/alts! [shutdown-chan close-signal-chan])]
                      (tracer/with-span! {:name "aggregator/wait-for-worker-to-finish"}
                        (stop wal-opts)
                        (a/<! (stop-worker)))
                      (when (= exit-ch close-signal-chan)
                        (tracer/record-info! {:name "aggregator/retry"
                                              :attributes {:wait-ms acquire-slot-interval-ms}})
                        (recur (a/timeout acquire-slot-interval-ms))))))
                (recur (a/timeout acquire-slot-interval-ms)))))
          (tracer/record-info! {:name "aggregator/slot-listener-exit"}))]
    (fn []
      (a/close! shutdown-chan)
      (when-let [wal-worker-finished (a/<!! process)]
        @wal-worker-finished))))

(defn start
  "Entry point for the agggregator.

  Creates the aggregator wal slot if it does not already exist.

  If the wal slot is already active, waits in the background
  for it to become inactive and subscribes to it.

  When we subscribe to the wal slot, we aggregate counts for all of
  the attrs."
  ([]
   (start {:slot-suffix nil
           :process-id @config/process-id
           :copy-sql triples-copy-sql
           ;; Check every minute to see if we can claim the slot
           :acquire-slot-interval-ms (* 1000 60)
           ;; Flush sketch changes to db every 10 seconds or 50k items
           :sketch-flush-ms (* 1000 10)
           :sketch-flush-max-items 50000}))
  ([{:keys [slot-suffix process-id copy-sql acquire-slot-interval-ms
            sketch-flush-ms sketch-flush-max-items]}]

   (initialize-slot {:slot-name (wal/full-slot-name slot-type slot-suffix)
                     :process-id process-id
                     :copy-sql copy-sql})

   (start-slot-listener {:slot-suffix slot-suffix
                         :acquire-slot-interval-ms acquire-slot-interval-ms
                         :sketch-flush-ms sketch-flush-ms
                         :sketch-flush-max-items sketch-flush-max-items
                         :process-id process-id})))

(defn start-global []
  (def shutdown (start)))

(defn stop-global []
  (when (bound? #'shutdown)
    (shutdown)))

(defn restart []
  (stop-global)
  (start-global))
