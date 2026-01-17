(ns instant.db.rule-where-testing
  (:require
   [clojure.core.async :as a]
   [instant.db.datalog :as d]
   [instant.flags :as flags]
   [instant.jdbc.sql :as sql]
   [instant.model.rule :as rule-model]
   [instant.util.coll :as ucoll]
   [instant.util.cache :as cache]
   [instant.util.tracer :as tracer]
   [instant.util.instaql :refer [instaql-nodes->object-tree forms-hash]]))

(def seen
  (cache/make {:ttl (* 1000 60)}))

(defn run-test [ctx permissioned-query-fn o]
  (let [start (System/nanoTime)
        res (try
              (permissioned-query-fn (assoc ctx :testing-rule-wheres true)
                                     o)
              (catch Exception e
                e))]
    {:ms (/ (double (- (System/nanoTime) start))
            1000000.0)
     :result res
     :error? (instance? Exception res)}))

(defn test-rule-wheres [ctx permissioned-query-fn o query-hash]
  (cache/get seen query-hash (constantly true))
  (tracer/with-new-trace-root
    (tracer/with-span! {:name "test-rule-wheres"
                        :attributes (merge {:query o
                                            :app-id (:app-id ctx)
                                            :current-user-id (-> ctx :current-user :id)})}
      (binding [sql/*query-timeout-seconds* 5]
        (let [ctx (assoc ctx :datalog-query-fn d/query)
              without-rule-wheres-fut
              (future
                (tracer/with-span! {:name "test-rule-wheres/without-rule-wheres"}
                  (run-test (assoc ctx :use-rule-wheres? false)
                            permissioned-query-fn o)))

              with-rule-wheres-fut
              (future
                (tracer/with-span! {:name "test-rule-wheres/with-rule-wheres"}
                  (run-test (assoc ctx :use-rule-wheres? true)
                            permissioned-query-fn o)))

              without-rule-wheres @without-rule-wheres-fut
              with-rule-wheres @with-rule-wheres-fut
              attrs {:without.ms (:ms without-rule-wheres)
                     :without.error? (:error? without-rule-wheres)
                     :with.ms (:ms with-rule-wheres)
                     :improvement (- (:ms without-rule-wheres)
                                     (:ms with-rule-wheres))
                     :with.error? (:error? with-rule-wheres)
                     :results-match? (cond (and (:error? with-rule-wheres)
                                                (:error? without-rule-wheres))
                                           true

                                           (or (:error? with-rule-wheres)
                                               (:error? without-rule-wheres))
                                           false

                                           :else
                                           (= (instaql-nodes->object-tree ctx (:result without-rule-wheres))
                                              (instaql-nodes->object-tree ctx (:result with-rule-wheres))))}]
          (tracer/add-data! {:attributes attrs})
          attrs)))))

(defn worth-testing? [ctx o query-hash]
  (and (flags/test-rule-wheres?)
       (not (cache/get-if-present seen query-hash))
       (let [rules (rule-model/get-by-app-id {:app-id (:app-id ctx)})]
         (and rules
              (ucoll/exists? (fn [field]
                               (rule-model/get-program! rules (name field) "view"))
                             (keys o))))))

(defonce process-chan (atom (a/chan (a/sliding-buffer 10))))

(defn queue-for-testing [ctx permissioned-query-fn o]
  (let [query-hash (forms-hash o)]
    (when (worth-testing? ctx o query-hash)
      (a/put! @process-chan [ctx permissioned-query-fn o query-hash]))))

(defn start []
  (reset! process-chan (a/chan (a/sliding-buffer 10)))
  (a/go
    (loop []
      (when-let [args (a/<! @process-chan)]
        (try (apply test-rule-wheres args)
             (catch Exception e
               (def -e e)
               nil)))
      (recur))))

(defn stop []
  (a/close! @process-chan))

(defn restart []
  (stop)
  (start))
