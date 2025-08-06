(ns instant.reactive.aggregator
  (:require
   [clojure.core.async :as a]
   [instant.config :as config]
   [instant.db.attr-sketch :as cms]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.copy :as copy]
   [instant.jdbc.wal :as wal]
   [instant.util.async :as ua]
   [instant.util.json :refer [<-json]]
   [instant.util.tracer :as tracer])
  (:import
   (org.postgresql.jdbc PgConnection)
   (org.postgresql.replication LogSequenceNumber)))

(declare shutdown)

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

(defn transform-wal-record
  "Extracts triples changes from the wal that would affect the sketch.

   Returns a list of (possibly empty) changes and the lsn."
  [{:keys [changes lsn] :as _record}]
  (tool/def-locals)
  (let [sketch-changes
        (reduce (fn [acc change]
                  (if (not= "triples" (:table change))
                    acc
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
                      (conj acc
                            ;; Remove the old
                            {:incr -1
                             :lsn lsn
                             :triples-data (get-triples-data (:identity change))}
                            ;; Add the new
                            {:incr 1
                             :lsn lsn
                             :triples-data (get-triples-data (:columns change))}))))
                []
                changes)]
    (when sketch-changes
      {:sketch-changes sketch-changes
       :lsn lsn})))

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

(defn process-sketch-changes [conn slot-name previous-lsn max-lsn changes]
  (tool/def-locals)
  (tracer/with-span! {:name "aggregator/process-sketch-changes"
                      :attributes {:previous-lsn previous-lsn
                                   :changed-sketch-count (count changes)
                                   :max-lsn max-lsn}}
    (when-not max-lsn
      (throw (ex-info "max-lsn was nil, we can't apply changes" {:previous-lsn previous-lsn
                                                                 :max-lsn max-lsn})))
    (let [sketches (cms/find-or-create-sketches! conn (keys changes))
          sketches (reduce-kv
                     (fn [acc k {:keys [records max-lsn]}]
                       ;; TODO: Handle case where attr is deleted in the interim
                       (let [sketch (get sketches k)]
                         (conj acc (-> sketch
                                       (update :sketch cms/add-batch records)
                                       (assoc :max-lsn max-lsn)))))
                     []
                     changes)]
      (cms/save-sketches! conn {:sketches sketches
                                :previous-lsn previous-lsn
                                :lsn max-lsn
                                :slot-name slot-name}))))

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

;; XXX: Have to reconfigure things a bit so that we start this after we get a lock on the slot
(defn start-worker [{:keys [wal-chan sketch-flush-ms sketch-flush-max-items
                            start-lsn flush-lsn-chan on-error slot-name]}]
  ;; XXX: If anything fails here, we should make some noise and
  ;;      shut down our worker so that someone else can try
  (tracer/record-info! {:name "aggregator-worker/start"})
  ;; sketch cache should live here

  (let [process-chan (ua/chunked-chan {:flush-ms sketch-flush-ms
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
                (a/>! (:in process-chan) wal-record)
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
                                                            slot-name
                                                            previous-lsn
                                                            max-lsn
                                                            changes)]
                  (a/>! flush-lsn-chan lsn)
                  (recur lsn))))
            (tracer/record-info! {:name "aggregator-worker/processor-shutdown"})
            (catch Throwable t
              (on-error t)
              (tracer/record-exception-span! t {:name "aggregator-worker/processor-error"}))))]
    (fn []
      (a/close! (:in process-chan))
      (a/<!! (:process process-chan))
      (a/<!! shuffler)
      (a/<!! processor))))

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
                                     :pgtype "checked_data_type"}])
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
                        (tool/def-locals)
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
  [{:keys [slot-name copy-sql]}]
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
                  (tool/def-locals)
                  (cms/insert-initial-sketches! (aurora/conn-pool :write)
                                                {:sketches group
                                                 :lsn lsn})))
            wal-status (cms/initialize-wal-aggregator-status (aurora/conn-pool :write)
                                                             {:lsn lsn
                                                              :slot-name slot-name})]
        (when (not= (:lsn wal-status) lsn)
          (throw (ex-info "Invalid lsn from wal-status" {:expected lsn
                                                         :actual (:lsn wal-status)
                                                         :wal-status wal-status})))))))

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
  (a/close! (:flush-lsn-chan wal-opts)))

(def slot-type :aggregator)

;; XXX: Need some with-spans
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
           sketch-flush-max-items]}]
  (let [shutdown-ch (a/chan)
        process
        (a/go
          ;; XXX: Throw an error in here an make sure it doesn't kill the listener
          (loop [timeout-ch (a/timeout 0)]
            (when (= timeout-ch (second (a/alts! [shutdown-ch timeout-ch])))
              (if-let [lsn (cms/get-start-lsn (aurora/conn-pool :read)
                                              {:slot-name (wal/full-slot-name slot-type
                                                                              slot-suffix)})]
                (let [{:keys [wal-chan worker-chan close-signal-chan flush-lsn-chan]}
                      (create-wal-chans)

                      wal-opts (wal/make-wal-opts
                                 {:wal-chan wal-chan
                                  :close-signal-chan close-signal-chan
                                  :get-conn-config (fn []
                                                     (or (config/get-next-aurora-config)
                                                         ;; Use the next db so that we don't
                                                         ;; have to worry about restarting the
                                                         ;; aggregator when failing over to a
                                                         ;; new blue/green deployment
                                                         (config/get-aurora-config)))
                                  :slot-suffix slot-suffix
                                  :slot-type slot-type
                                  :flush-lsn-chan flush-lsn-chan
                                  :lsn lsn})

                      started-promise (:started-promise wal-opts)
                      continue-chan (a/chan)
                      wal-exit-chan (a/chan)
                      wal-worker (ua/fut-bg
                                   (wal/start-aggregator-worker wal-opts)
                                   (deliver started-promise :recur)
                                   (a/close! wal-exit-chan))

                      ;; Wait for the wal worker to potentially claim the slot
                      _ (ua/vfuture
                          (let [wal-start-result @started-promise]
                            (case wal-start-result
                              :recur (a/put! continue-chan :recur)
                              true (a/put! continue-chan :slot-claimed))))
                      _ (tool/def-locals)
                      [next-v next-ch] (a/alts! [continue-chan shutdown-ch])]
                  (cond (= next-ch shutdown-ch)
                        (do (stop wal-opts)
                            @wal-worker)

                        (= :recur next-v)
                        (recur (a/timeout acquire-slot-interval-ms))

                        (= :slot-claimed next-v)
                        (let [stop-worker (start-worker {:wal-chan worker-chan
                                                         :flush-lsn-chan flush-lsn-chan
                                                         :slot-name (:slot-name wal-opts)
                                                         :start-lsn lsn
                                                         :sketch-flush-ms sketch-flush-ms
                                                         :sketch-flush-max-items sketch-flush-max-items
                                                         :on-error (fn [_t]
                                                                     (a/close! wal-exit-chan))})
                              _ (tool/def-locals)
                              [_exit-v exit-ch] (a/alts! [shutdown-ch wal-exit-chan])]
                          (stop wal-opts)
                          (stop-worker)
                          (when (= exit-ch wal-exit-chan)
                            (recur (a/timeout acquire-slot-interval-ms))))))
                (recur (a/timeout acquire-slot-interval-ms))))))]
    (fn []
      (a/close! shutdown-ch)
      (a/<!! process))))

;; XXX: Need some way to test.
(defn start
  "Entry point for the agggregator.

  Creates the aggregator wal slot if it does not already exist.

  If the wal slot is already active, waits in the background
  for it to become inactive and subscribes to it.

  When we subscribe to the wal slot, we aggregate counts for all of
  the attrs."
  ([]
   (start {:slot-suffix (name (config/get-env))
           :copy-sql triples-copy-sql
           ;; Check every minute to see if we can claim the slot
           :aquire-slot-interval-ms (* 1000 60)
           ;; Flush sketch changes to db every 10 seconds or 50k items
           :sketch-flush-ms (* 1000 10)
           :sketch-flush-max-items 50000}))
  ([{:keys [slot-suffix copy-sql acquire-slot-interval-ms
            sketch-flush-ms sketch-flush-max-items]}]

   (initialize-slot {:slot-name (wal/full-slot-name slot-type slot-suffix)
                     :copy-sql copy-sql})

   (start-slot-listener {:slot-suffix slot-suffix
                         :acquire-slot-interval-ms acquire-slot-interval-ms
                         :sketch-flush-ms sketch-flush-ms
                         :sketch-flush-max-items sketch-flush-max-items})))

(defn start-global []
  (def shutdown (start)))

(defn stop-global []
  (when (bound? #'shutdown)
    (shutdown)))

(defn restart []
  (stop-global)
  (start-global))
