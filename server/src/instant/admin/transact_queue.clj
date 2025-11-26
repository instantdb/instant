(ns instant.admin.transact-queue
  (:require
   [instant.config :as config]
   [instant.db.permissioned-transaction :as permissioned-tx]
   [instant.grouped-queue :as grouped-queue]
   [instant.util.delay :as delay]
   [instant.util.exception :as ex]
   [instant.util.tracer :as tracer]))

(def num-receive-workers (* (if config/fewer-vfutures?
                              20
                              100)
                            (delay/cpu-count)))

(declare tx-q)

(defn put!
  ([item]
   (grouped-queue/put! tx-q item))
  ([q item]
   (grouped-queue/put! q item)))

(defn attr-key [tx-steps]
  (when (= :add-triple (ffirst tx-steps))
    (-> tx-steps first (nth 2))))

(defn group-key [{:keys [app-id tx-steps]}]
  [app-id (or (attr-key tx-steps)
              (random-uuid))])

(defn combine [_a _b]
  nil)

(defn process [_group-key {:keys [ctx tx-steps response-promise open? span]}]
  (binding [tracer/*span* span]
    (try
      (when-not (open?)
        (ex/throw-connection-closed!))
      (deliver response-promise {:ok (permissioned-tx/transact! ctx tx-steps)})
      (catch Throwable t
        (deliver response-promise {:error t})))))

(defn start []
  (.bindRoot #'tx-q
             (grouped-queue/start
               {:group-key-fn #'group-key
                :combine-fn   #'combine
                :process-fn   #'process
                :max-workers  num-receive-workers
                :metrics-path "instant.admin.transact-queue"})))

(defn stop []
  (when (bound? #'tx-q)
    (grouped-queue/stop tx-q)
    (.unbindRoot #'tx-q)))
