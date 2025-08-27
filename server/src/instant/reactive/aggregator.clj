(ns instant.reactive.aggregator
  (:require
   [clojure.core.async :as a]
   [clojure.core.cache.wrapped :as cache]
   [instant.config :as config]
   [instant.db.attr-sketch :as cms]
   [instant.db.model.triple :as triple]
   [instant.flags :as flags]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.copy :as copy]
   [instant.jdbc.wal :as wal]
   [instant.util.async :as ua]
   [instant.util.json :refer [<-json]]
   [instant.util.tracer :as tracer])
  (:import
   (com.fasterxml.jackson.core.exc StreamConstraintsException)
   (java.time Instant)
   (org.postgresql.jdbc PgConnection)
   (org.postgresql.replication LogSequenceNumber)))

(declare shutdown)

;; --------------
;; Initialization

(def triples-copy-sql "copy (select app_id, attr_id, entity_id, value, checked_data_type, created_at, eav, ea from triples order by app_id, attr_id) to stdout with (format binary)")

(defn initial-sketch-seq
  "Returns a lazy seq of sketches with app-id and attr-id, expects `copy-sql` to sort by
   app_id and attr_id. Meant to be used once when bootstrapping the attr sketches."
  [^PgConnection connection copy-sql]
  (let [copy-seq (copy/copy-seq connection
                                copy-sql
                                [{:name :app-id
                                  :pgtype "uuid"}
                                 {:name :attr-id
                                  :pgtype "uuid"}
                                 {:name :entity-id
                                  :pgtype "uuid"}
                                 {:name :value
                                  :pgtype "jsonb"}
                                 {:name :checked-data-type
                                  :pgtype "checked_data_type"}
                                 {:name :created-at
                                  :pgtype "bigint"}
                                 {:name :eav
                                  :pgtype "boolean"}
                                 {:name :ea
                                  :pgtype "boolean"}]
                                {:handle-json-parse-error (fn [e _props]
                                                            ;; Replace objects that are too large to read
                                                            ;; with an empty object. That will keep it out
                                                            ;; of the bins, but keep it in the total.
                                                            (if (instance? StreamConstraintsException e)
                                                              (with-meta {} {:value-too-large? true})
                                                              (throw e)))})

        ;; Updates date and removes data-type if the value is too large
        update-triple (fn [row]
                        (cond-> row
                          (= :date (:checked-data-type row))
                          (update :value (fn [v]
                                           ;; This isn't perfect, since the value may have been
                                           ;; updated without changing created_at, but it's as
                                           ;; close as we can get.
                                           (let [created (Instant/ofEpochMilli (:created-at row))]
                                             (triple/parse-date-value v created))))
                          (:value-too-large? (meta (:value row)))
                          (assoc :checked-data-type nil)))

        base-sketch (cms/make-sketch)

        triple-count (volatile! 0)
        sketch-count (volatile! 0)
        span (volatile! (tracer/new-span! {:name "aggregator/initial-sketch-batch"}))
        end-span (fn [finished?]
                   (tracer/add-data! @span {:attributes {:triple-count @triple-count
                                                         :sketch-count @sketch-count
                                                         :finished? finished?}})
                   (tracer/end-span! @span)
                   (vreset! span (tracer/new-span! {:name "aggregator/initial-sketch-batch"}))
                   nil)
        inc-triple-count (fn []
                           (when (zero? (mod (vswap! triple-count inc) 1e5))
                             (end-span false)))

        ;; How many triple values to flush to the sketch per batch
        sketch-flush-limit 100000

        collect (fn collect [coll]
                  (lazy-seq
                    (if-let [s (seq coll)]
                      (loop [s s
                             app-id (:app-id (first s))
                             attr-id (:attr-id (first s))
                             triples (transient {})
                             reverse-triples (transient {})
                             sketch base-sketch
                             reverse-sketch base-sketch]
                        (if (and (= app-id (:app-id (first s)))
                                 (= attr-id (:attr-id (first s))))
                          (let [triple (update-triple (first s))
                                k (select-keys triple [:value :checked-data-type])
                                ref-k (when (and (:eav triple)
                                                 (not (:ea triple)))
                                        {:value (:entity-id triple)})]
                            (inc-triple-count)
                            (if (<= sketch-flush-limit (count triples))
                              (recur (rest s)
                                     app-id
                                     attr-id
                                     (assoc! (transient {}) k 1)
                                     (cond-> (transient {})
                                       ref-k (assoc! ref-k 1))
                                     (cms/add-batch sketch (persistent! triples))
                                     (cms/add-batch reverse-sketch (persistent! reverse-triples)))
                              (recur (rest s)
                                     app-id
                                     attr-id
                                     (assoc! triples k (inc (get triples k 0)))
                                     (cond-> reverse-triples
                                       ref-k (assoc! ref-k (inc (get reverse-triples ref-k 0))))
                                     sketch
                                     reverse-sketch)))
                          (let [forward-sketch (cms/add-batch sketch (persistent! triples))
                                reverse-sketch (cms/add-batch reverse-sketch (persistent! reverse-triples))]
                            (vswap! sketch-count inc)
                            (cons {:app-id app-id
                                   :attr-id attr-id
                                   :sketch forward-sketch
                                   :reverse-sketch (when (pos? (:total reverse-sketch))
                                                     reverse-sketch)}
                                  (collect s)))))
                      (end-span true))))]
    (collect copy-seq)))

(defn initialize-slot
  "Called on startup, will initialize the permanent aggregation slot and update
   all of the attr sketches with the data up to the slot's snapshot.

   Does nothing if the slot has already been created."
  [{:keys [slot-name copy-sql process-id]}]
  (tracer/with-span! {:name "aggregator/initialize-slot"
                      :attributes {:pid process-id
                                   :slot-name slot-name}}
    (when-let [{:keys [connection lsn]}
               (tracer/with-span! {:name "aggregator/maybe-create-slot"}
                 (wal/create-sync-db-replication-slot-and-connection
                   (config/get-aurora-config)
                   slot-name))]
      (with-open [connection ^PgConnection connection]
        (doseq [sketches (partition-all 1000 (initial-sketch-seq connection copy-sql))]
          (tracer/with-span! {:name "aggregator/insert-initial-sketches"
                              :attributes {:pid process-id
                                           :slot-name slot-name}}
            (cms/insert-initial-sketches! (aurora/conn-pool :write)
                                          {:sketches sketches
                                           :lsn lsn}))))
      (let [wal-status (cms/initialize-wal-aggregator-status (aurora/conn-pool :write)
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
              "entity_id" (assoc data :entity-id (parse-uuid value))
              "value" (assoc data :value (try
                                           (<-json value)
                                           (catch StreamConstraintsException _e
                                             (with-meta {} {:value-too-large? true}))))
              "checked_data_type" (assoc data :checked-data-type (keyword value))
              "created_at" (assoc data :created-at value)
              "ea" (assoc data :ea value)
              "eav" (assoc data :eav value)
              data))
          {}
          columns))

(defn update-triple
  "Updates the date to an Instant and removes the checked-data-type if
   the value was too large to parse.
   Requires the identity-data to get created-at or checked-data-type if
   those values weren't updated."
  [triples-data identity-data]
  (cond-> triples-data
    (or (= :date (:checked-data-type triples-data))
        (and (not (contains? triples-data :checked-data-type))
             (= :date (:checked-data-type identity-data))))
    (update :value
            (fn [v]
              (let [tx-now (Instant/ofEpochMilli (or (:created-at triples-data)
                                                     (:created-at identity-data)))]
                (triple/parse-date-value v tx-now))))

    (:value-too-large? (meta (:value triples-data)))
    (assoc :checked-data-type nil)))

(defn store-reverse?
  "Whether we should store the entity-id for the triple in the reverse sketch.
   Returns true if the triples is a cardinality-many ref."
  [triple-data]
  (and (:eav triple-data)
       (not (:ea triple-data))))

;; Used by tests so that we can prevent the aggregator
;; from overwriting data in the tests
(def test-filter identity)

(defn transform-wal-record
  "Extracts triples changes from the wal that would affect the sketch.

   Returns a list of changes and the lsn."
  [start-lsn change]
  (let [lsn (LogSequenceNumber/valueOf ^String (:lsn change))
        sketch-changes
        (test-filter
         (when (= "triples" (:table change))
           (case (:action change)
             :insert
             [{:incr 1
               :lsn lsn
               :triples-data (-> (get-triples-data (:columns change))
                                 (update-triple nil))}]

             :delete
             [{:incr -1
               :lsn lsn
               :triples-data (-> (get-triples-data (:identity change))
                                 (update-triple nil))}]

             :update
             (let [identity-data (get-triples-data (:identity change))
                   update-data (let [data (get-triples-data (:columns change))]
                                 (if (contains? data :value)
                                   data
                                   ;; The value was toasted and not updated, so
                                   ;; postgres didn't give it to us in the update.
                                   ;; We might still need it if the checked_data_type
                                   ;; changed, so we'll use the value from the identity
                                   ;; column.
                                   (assoc data :value (:value identity-data))))]
               ;; Remove the old
               [{:incr -1
                 :lsn lsn
                 :triples-data (-> identity-data
                                   (update-triple nil))}
                ;; Add the new
                {:incr 1
                 :lsn lsn
                 :triples-data (update-triple update-data
                                              identity-data)}]))))]
    ;; When we restart the slot, it will also include the last
    ;; transaction that we processed, so we need to filter out anything
    ;; less than or equal to that lsn
    (when (= -1 (compare start-lsn lsn))
      {:sketch-changes sketch-changes
       :lsn lsn
       :tx-bytes (:tx-bytes change)})))

(defn wal-record-xf [start-lsn]
  (keep (fn [record]
          (transform-wal-record start-lsn record))))

;; ----------
;; aggregator

(defn max-lsn ^LogSequenceNumber
  [^LogSequenceNumber a ^LogSequenceNumber b]
  (cond (not a) b
        (not b) a
        :else (case (compare a b)
                (0 1) a
                -1 b)))

(defn combine-sketch-changes [{:keys [changes] :as existing}
                              {:keys [sketch-changes lsn tx-bytes]}]
  {:max-lsn lsn
   :tx-bytes (+ (:tx-bytes existing 0) tx-bytes)
   :changes (reduce (fn [acc {:keys [incr triples-data lsn]}]
                      (let [key {:app-id (:app-id triples-data)
                                 :attr-id (:attr-id triples-data)}
                            record {:value (:value triples-data)
                                    :checked-data-type (:checked-data-type triples-data)}
                            reverse-record (when (store-reverse? triples-data)
                                             {:value (:entity-id triples-data)})]
                        (cond-> acc
                          true (update-in [key :records record] (fnil + 0) incr)
                          true (update-in [key :max-lsn] max-lsn lsn)
                          reverse-record (update-in [key :reverse-records reverse-record] (fnil + 0) incr))))
                    changes
                    sketch-changes)})

(defn process-sketch-changes [conn {:keys [process-id slot-name previous-lsn
                                           max-lsn changes sketch-cache tx-bytes]}]
  (tracer/with-span! {:name "aggregator/process-sketch-changes"
                      :attributes {:previous-lsn previous-lsn
                                   :changed-sketch-count (count changes)
                                   :max-lsn max-lsn
                                   :tx-bytes tx-bytes
                                   :pid process-id
                                   :slot-name slot-name}}
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
                     (fn [acc k {:keys [records reverse-records max-lsn]}]
                       ;; attr may have been deleted in the interim
                       (if-let [sketch (get sketches k)]
                         (conj acc (cond-> sketch
                                     true (update :sketch cms/add-batch records)
                                     true (assoc :max-lsn max-lsn)

                                     (seq reverse-records)
                                     (update :reverse-sketch (fnil cms/add-batch (cms/make-sketch)) reverse-records)))
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
                                       :size (fn [{:keys [changes] :as x}]
                                               (count changes))})

        shuffler
        ;; Shuffles items from the wal-chan to the process-chan, where they are
        ;; combined with combine-sketch-changes
        (a/go
          (try
            (loop []
              (when-some [wal-record (a/<! wal-chan)]
                (ua/>!-close-safe close-signal-chan (:in process-chan) wal-record)
                (recur)))
            (tracer/record-info! {:name "aggregator-worker/shuffler-shutdown"
                                  :attributes {:pid process-id
                                               :slot-name slot-name}})
            (catch Throwable t
              (on-error t)
              (tracer/record-exception-span! t {:name "aggregator-worker/shuffler-error"
                                                :attributes {:pid process-id
                                                             :slot-name slot-name}}))))

        ;; Processes the items every N seconds (or M items) in a batch
        processor
        (a/go
          (try
            (loop [previous-lsn start-lsn]
              (when-some [{:keys [changes max-lsn tx-bytes]} (a/<! (:out process-chan))]
                (let [{:keys [lsn]} (process-sketch-changes (aurora/conn-pool :write)
                                                            {:process-id process-id
                                                             :slot-name slot-name
                                                             :previous-lsn previous-lsn
                                                             :max-lsn max-lsn
                                                             :changes changes
                                                             :tx-bytes tx-bytes
                                                             :sketch-cache sketch-cache})]
                  (ua/>!-close-safe close-signal-chan flush-lsn-chan lsn)
                  (recur lsn))))
            (tracer/record-info! {:name "aggregator-worker/processor-shutdown"
                                  :attributes {:pid process-id
                                               :slot-name slot-name}})
            (catch Throwable t
              (on-error t)
              (tracer/record-exception-span! t {:name "aggregator-worker/processor-error"
                                                :attributes {:pid process-id
                                                             :slot-name slot-name}}))))]
    (fn []
      (let [shutdown-finished ((:shutdown process-chan))]
        (a/go
          (a/<! shutdown-finished)
          (a/<! shuffler)
          (a/<! processor))))))

;; -------------
;; orchestration

(defn create-wal-chans [start-lsn]
  (let [chan (a/chan 1 (wal-record-xf start-lsn))]
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
        slot-name (wal/full-slot-name slot-type
                                      slot-suffix)
        process
        (a/go
          (loop [timeout-ch (a/timeout 0)]
            (when (= timeout-ch (second (a/alts! [shutdown-chan timeout-ch])))
              (if-let [lsn (cms/get-start-lsn (aurora/conn-pool :read)
                                              {:slot-name slot-name})]
                (let [{:keys [wal-chan worker-chan flush-lsn-chan close-signal-chan]}
                      (create-wal-chans lsn)

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
                      (tracer/with-span! {:name "aggregator/wait-for-worker-to-finish"
                                          :attributes {:pid process-id
                                                       :slot-name (:slot-name wal-opts)}}
                        (stop wal-opts)
                        (a/<! (stop-worker)))
                      (when (= exit-ch close-signal-chan)
                        (tracer/record-info! {:name "aggregator/retry"
                                              :attributes {:wait-ms acquire-slot-interval-ms
                                                           :attributes {:pid process-id
                                                                        :slot-name (:slot-name wal-opts)}}})
                        (recur (a/timeout acquire-slot-interval-ms))))))
                (recur (a/timeout acquire-slot-interval-ms)))))
          (tracer/record-info! {:name "aggregator/slot-listener-exit"
                                :attributes {:pid process-id
                                             :slot-name slot-name}}))]
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

   (when-not (flags/toggled? :disable-aggregator)

     ;; This will be set in production after we've initialized the
     ;; slot. If something happens to the slot, we don't want to block
     ;; startup.
     (when-not (flags/toggled? :skip-aggregator-initialization)
       (initialize-slot {:slot-name (wal/full-slot-name slot-type slot-suffix)
                         :process-id process-id
                         :copy-sql copy-sql}))

     (start-slot-listener {:slot-suffix slot-suffix
                           :acquire-slot-interval-ms acquire-slot-interval-ms
                           :sketch-flush-ms sketch-flush-ms
                           :sketch-flush-max-items sketch-flush-max-items
                           :process-id process-id}))))

(defn start-global []
  (def shutdown (start)))

(defn stop-global []
  (when (bound? #'shutdown)
    (shutdown)))

(defn restart []
  (stop-global)
  (start-global))
