(ns instant.reactive.aggregator
  (:require
   [clojure.core.async :as a]
   [instant.config :as config]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.jdbc.wal :as wal]
   [instant.util.async :as ua]
   [instant.db.attr-sketch :as cms]
   [instant.util.json :refer [<-json]]
   [instant.util.tracer :as tracer])
  (:import
   (org.postgresql.replication LogSequenceNumber)))

(declare wal-opts)

(declare aggregator-q)

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

(defn transform-wal-record [{:keys [changes lsn] :as _record}]
  (let [sketch-changes (reduce (fn [acc change]
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
    (when (seq sketch-changes)
      {:sketch-changes sketch-changes})))

(defn wal-record-xf
  "Filters wal records for supported changes. Returns [app-id changes]"
  []
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

(defn collect-sketch-changes [sketch-changes]
  (reduce (fn [acc {:keys [incr triples-data lsn]}]
            (let [key {:app-id (:app-id triples-data)
                       :attr-id (:attr-id triples-data)}
                  record {:value (:value triples-data)
                          :checked-data-type (:checked-data-type triples-data)}]
              (-> acc
                  (update-in [:changes key :records record] (fnil + 0) incr)
                  (update-in [:changes key :max-lsn] max-lsn lsn)
                  (update :max-lsn max-lsn lsn))))
          {:changes {}
           :max-lsn nil}
          sketch-changes))

(defn process-sketch-changes [conn sketch-changes]
  (tool/def-locals)
  (tracer/with-span! {:name "aggregator/process-sketch-changes"
                      :attributes {:change-count (:count sketch-changes)}}
    (let [{:keys [changes max-lsn]} (collect-sketch-changes sketch-changes)]
      (assert max-lsn "max-lsn was nil, we can't apply changes")
      (tracer/add-data! {:attributes {:max-lsn max-lsn}})
      ;; XXX: Get sketches all in one go
      (let [sketches (cms/find-or-create-sketches! (keys changes))
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
                                  ;; :previous-lsn ??
                                  :lsn max-lsn})))))

;; XXXX: pass start-lsn in here
;;       Have to reconfigure things a bit so that we start this after we get a lock on the slot
(defn start-worker [wal-chan process-chan]
  ;; XXX: If anything fails here, we should make some noise and
  ;;      shut down our worker so that someone else can try
  (tracer/record-info! {:name "aggregator-worker/start"})
  ;; sketch cache should live here

  ;; Shuffles items from the wal-chan to the process-chan
  (a/go
    (loop []
      (when-some [{:keys [sketch-changes]} (a/<! wal-chan)]
        (a/>! (:in process-chan) sketch-changes)
        (recur)))
    (tracer/record-info! {:name "aggregator-worker/shutdown"}))

  ;; Processes the items every N seconds in a batch
  (a/go
    (loop [_previous-lsn nil] ;; Get previous lsn when we start up
      (when-some [sketch-changes (a/<! (:out process-chan))]
        (let [{:keys [lsn]} (process-sketch-changes (aurora/conn-pool :write)
                                                    sketch-changes)]
          (recur lsn))))
    (tracer/record-info! {:name "aggregator-worker/shutdown"})))

;; -------------
;; orchestration

(defn wal-ex-handler [e]
  (tracer/record-exception-span! e {:name "aggregator/wal-ex-handler"
                                    :escaping? false})
  (wal/shutdown! wal-opts))

(defn create-wal-chans []
  (let [chan (a/chan 1 (wal-record-xf))]
    {:wal-chan chan
     :close-signal-chan (a/chan)
     :worker-chan chan}))

;; XXX: Need some way to test.
(defn start
  "Entry point for the agggregator.

  Creates the aggregator wal slot if it does not already exist.

  If the wal slot is already active, waits in the background
  for it to become inactive and subscribes to it.

  When we subscribe to the wal slot, we aggregate counts for all of
  the attrs."
  ([]
   (start nil))
  ([slot-name-for-testing]
   (let [{:keys [wal-chan worker-chan close-signal-chan]}
         (create-wal-chans)

         wal-opts (wal/make-wal-opts {:wal-chan wal-chan
                                      :close-signal-chan close-signal-chan
                                      :ex-handler wal-ex-handler
                                      :get-conn-config (fn []
                                                         (or (config/get-next-aurora-config)
                                                             ;; Use the next db so that we don't
                                                             ;; have to worry about restarting the
                                                             ;; invalidator when failing over to a
                                                             ;; new blue/green deployment
                                                             (config/get-aurora-config)))
                                      :slot-name (or slot-name-for-testing
                                                     (name (config/get-env)))
                                      :slot-type :aggregator})
         process-chan (ua/chunked-chan {:flush-ms 10000
                                        :max-items 10000})]
     (ua/fut-bg
       (wal/start-worker wal-opts))

     ;; XXX: Probably needs to change
     @(:started-promise wal-opts)

     (def aggregator-q
       (start-worker worker-chan process-chan))

     wal-opts)))

(defn start-global []
  (def wal-opts (start)))

(defn stop [wal-opts]
  (let [shutdown-future (future (wal/shutdown! wal-opts))]
    (loop []
      (when-not (realized? shutdown-future)
        (wal/kick-wal (aurora/conn-pool :write))
        (Thread/sleep 100)
        (recur))))
  (a/close! (:to wal-opts))
  (a/close! (:close-signal-chan wal-opts)))

(defn stop-global []
  (when (bound? #'wal-opts)
    (stop wal-opts)))

(defn restart []
  (stop-global)
  (start-global))
