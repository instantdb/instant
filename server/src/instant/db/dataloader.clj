(ns instant.db.dataloader
  (:require
   [instant.util.async :as ua]
   [instant.util.exception :as ex]))

(defn run-batch! [{:keys [state batch-fn]} k]
  (let [[old _] (swap-vals! state dissoc k)
        {:keys [requests]} (get old k)
        all-args (mapv :args requests)
        result-promises (mapv :result-promise requests)
        results (try
                  (batch-fn all-args)
                  (catch Exception e
                    (mapv (fn [_] e) all-args)))]
    (doseq [[p r] (map vector result-promises results)]
      (deliver p r))))

(defn schedule [{:keys [key-fn state delay-ms] :as dataloader-opts} {:keys [args] :as request}]
  (let [k (apply key-fn args)
        v
        (swap! state
               update
               k
               (fn [{:keys [requests schedule-delay]}]
                 {:requests (conj requests request)
                  :schedule-delay (or schedule-delay
                                      (delay
                                        ;; store/swap-datalog-cache! has a future
                                        ;; that will be canceled if all of its "watchers"
                                        ;; are canceled. Something like that would be a
                                        ;; nice improvement over severed-vfuture here.
                                        (ua/severed-vfuture
                                          (Thread/sleep (long delay-ms))
                                          (run-batch! dataloader-opts k))))}))
        schedule-delay (get-in v [k :schedule-delay])]
    @schedule-delay))

(defn get-one [{:keys [timeout-ms] :as dataloader-opts} args]
  (let [p (promise)
        request {:args args :result-promise p}
        _ (schedule dataloader-opts request)
        result (deref p timeout-ms :timeout)]
    (when (= :timeout result)
      (ex/throw-operation-timeout! :dataloader-get timeout-ms))
    result))

(defn create-loader [dataloader-opts]
  (fn [& args]
    (let [result (get-one dataloader-opts args)]
      (if (instance? Exception result)
        (throw result)
        result))))

(comment
  (defn get-batched [args]
    (mapv (fn [x] (keyword (str "r-" x))) args))

  (def state (atom {}))

  (def get (create-loader {:state state
                           :key-fn (constantly :k)
                           :batch-fn get-batched
                           :delay-ms 5
                           :timeout-ms 1000}))

  (get 1))
