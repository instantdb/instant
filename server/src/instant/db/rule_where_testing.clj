(ns instant.db.rule-where-testing
  (:require [clojure.core.async :as a]
            [clojure.core.cache.wrapped :as cache]
            [instant.db.datalog :as d]
            [instant.flags :as flags]
            [instant.jdbc.sql :as sql]
            ;; [instant.model.rule :as rule-model]
            ;; [instant.util.coll :as ucoll]
            [instant.util.tracer :as tracer]
            [instant.util.instaql :refer [instaql-nodes->object-tree forms-hash]]))

;; DWW: Temporarily hijacking this ns to test out pg_hint_plan
;;      Add a new row to `toggles` in the instant-config app with
;;      setting="pg-hint-test/postgres-index-name" (e.g. pg-hint-test/av_index), value=true
;;      to test with that index enabled.

(def seen (cache/ttl-cache-factory {} :ttl (* 1000 60)))

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
  (cache/lookup-or-miss seen query-hash (constantly true))
  (binding [tracer/*span* nil] ;; Create new root span
    (tracer/with-span! {:name "test-pg-hint-plan"
                        :attributes (merge {:query o
                                            :app-id (:app-id ctx)
                                            :current-user-id (-> ctx :current-user :id)}
                                           (flags/pg-hint-testing-toggles))}
      (binding [sql/*query-timeout-seconds* 5]
        (let [ctx (assoc ctx :datalog-query-fn d/query)
              without-rule-wheres-fut
              (future
                (tracer/with-span! {:name "test-pg-hint-plan/without-hint-plan"}
                  (binding [d/*testing-pg-hints* false]
                    (run-test ctx ;;(assoc ctx :use-rule-wheres? false)
                              permissioned-query-fn o))))

              with-rule-wheres-fut
              (future
                (tracer/with-span! {:name "test-pg-hint-plan/with-hint-plan"}
                  (binding [d/*testing-pg-hints* true]
                    (run-test ctx ;;(assoc ctx :use-rule-wheres? true)
                              permissioned-query-fn o))))

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

#_(defn worth-testing? [ctx o]
  (and (flags/test-rule-wheres?)
       (let [rules (rule-model/get-by-app-id {:app-id (:app-id ctx)})]
         (and rules
              (ucoll/exists? (fn [field]
                               (rule-model/get-program! rules (name field) "view"))
                             (keys o))))))

(defn worth-testing? [_ctx _o query-hash]
  (and (flags/test-rule-wheres?)
       (not (cache/lookup seen query-hash))))

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
