(ns instant.db.hint-testing
  (:refer-clojure :exclude [test])
  (:require
   [clojure.core.async :as a]
   [clojure.core.cache.wrapped :as cache]
   [instant.db.datalog :as d]
   [instant.flags :as flags]
   [instant.jdbc.sql :as sql]
   [instant.util.cache :refer [lookup-or-miss]]
   [instant.util.instaql :refer [forms-hash]]
   [instant.util.json :refer [->json]]
   [instant.util.tracer :as tracer]
   [lambdaisland.deep-diff2 :as ddiff]))

(def triples-alias-sorted-map
  "The aliases are t0, t1, t2, etc. This sorts the keys in the map
   so that t2 is after t10."
  (sorted-map-by (fn [a b]
                   (let [a-num (some-> (re-find #"\d+" a)
                                       (Long/parseLong))
                         b-num (some-> (re-find #"\d+" b)
                                       (Long/parseLong))
                         res (compare a-num b-num)]
                     (if (zero? res)
                       (compare a b)
                       res)))))

(defn determine-indexes-used
  "Walks the explain output to find which indexes were used for each
  alias, includes the index, node type (e.g. Index scan or Bitmap
  index scan), and the time it took."
  [plan]
  (letfn [(step [node alias acc]
            (cond
              (map? node)
              (let [alias' (or (get node "Alias")
                               (get node "Relation Name")
                               alias)

                    acc' (if-let [idx (get node "Index Name")]
                           (update acc alias' (fnil conj #{})
                                   {:index idx
                                    :node (get node "Node Type")
                                    :time (* (get node "Actual Loops" 1)
                                             (get node "Actual Total Time"))})
                           acc)]

                (reduce #(step %2 alias' %1) acc' (vals node)))

              (sequential? node)
              (reduce #(step %2 alias %1) acc node)

              :else acc))]
    (step plan nil triples-alias-sorted-map)))

(defn explain-datalog
  "Runs explain on the query and returns times and indexes uses."
  [ctx patterns]
  (let [explain-output (d/explain ctx patterns)
        execution-time (-> explain-output
                           (get-in [0 "QUERY PLAN"])
                           first
                           (get "Execution Time"))
        planning-time (-> explain-output
                          (get-in [0 "QUERY PLAN"])
                          first
                          (get "Planning Time"))]
    {:time (+ execution-time planning-time)
     :execution-time execution-time
     :planning-time planning-time
     :indexes (determine-indexes-used explain-output)}))

(defn prepare-indexes-for-diff
  "Removes time from the indexes-used for better diffing."
  [indexes]
  (update-vals indexes
               (fn [vs]
                 (map (fn [x]
                        (dissoc x :time))
                      vs))))

(defn diff-indexes
  "Returns a diff of the indexes by index and node type in ddiff format.
   {\"t0\" #{{:+ {:index \"ea_index\"}}
             {:- {:index \"triples_pkey\"}}}"
  [old new]
  (let [diff-keys (-> (ddiff/diff (prepare-indexes-for-diff old)
                                  (prepare-indexes-for-diff new))
                      ddiff/minimize
                      keys)]
    (into triples-alias-sorted-map
          (ddiff/minimize (ddiff/diff (select-keys old diff-keys)
                                      (select-keys new diff-keys))))))

(def seen
  "Keeps track of the query hashes that we've already seen so that we
   can try to get more variety in our sampling."
  (cache/ttl-cache-factory {} :ttl (* 1000 60)))

(defn test-pg-hints-for-datalog-query [ctx patterns query query-hash]
  (tracer/with-new-trace-root
    (tracer/with-span! {:name "test-pg-hints-for-datalog"
                        :attributes {:query query
                                     :query-hash query-hash
                                     :app-id (:app-id ctx)
                                     :current-user-id (-> ctx :current-user :id)
                                     :patterns (pr-str patterns)}}
      (let [old (tracer/with-span! {:name "test-pg-hints-for-datalog/without-hint-plan"}
                  (try
                    (let [res (explain-datalog ctx patterns)]
                      (tracer/add-data! {:attributes res})
                      res)
                    (catch Exception e
                      e)))
            new (tracer/with-span! {:name "test-pg-hints-for-datalog/with-hint-plan"}
                  (binding [d/*testing-pg-hints* true]
                    (try
                      (let [res (explain-datalog ctx patterns)]
                        (tracer/add-data! {:attributes res})
                        res)
                      (catch Exception e
                        e))))
            sketches (tracer/with-span! {:name "test-pg-hints-for-datalog/with-sketches"}
                       (binding [d/*testing-pg-hints* true
                                 d/*estimate-with-sketch* true]
                         (try
                           (let [res (explain-datalog ctx patterns)]
                             (tracer/add-data! {:attributes res})
                             res)
                           (catch Exception e
                             e))))]
        (tracer/add-data! {:attributes {:without.ms (:time old)
                                        :with.ms (:time new)
                                        :with-sketch.ms (:time sketches)
                                        :without.error (instance? Exception old)
                                        :with.error (instance? Exception new)
                                        :with-sketch.error (instance? Exception sketches)
                                        :improvement (- (or (:time sketches)
                                                            (* 1000 10))
                                                        (or (:time new)
                                                            (* 1000 10)))
                                        :base-improvement (- (or (:time sketches)
                                                                 (* 1000 10))
                                                             (or (:time old)
                                                                 (* 1000 10)))
                                        :index-diff (when (and (:indexes new)
                                                               (:indexes sketches))
                                                      (->json (diff-indexes (:indexes new)
                                                                            (:indexes sketches))))
                                        :base-index-diff (when (and (:indexes old)
                                                                    (:indexes sketches))
                                                           (->json (diff-indexes (:indexes old)
                                                                                 (:indexes sketches))))}})))))

(defn test-pg-hints
  "Runs the query to capture all datalog queries, then compares the
  explain (analyze) time and indexes used for each datalog query
  individually."
  [ctx permissioned-query-fn o query-hash]
  (lookup-or-miss seen query-hash (constantly true))
  (tracer/with-new-trace-root
    (tracer/with-span! {:name "test-pg-hint-plan"
                        :attributes (merge {:query o
                                            :query-hash query-hash
                                            :app-id (:app-id ctx)
                                            :current-user-id (-> ctx :current-user :id)}
                                           (flags/pg-hint-testing-toggles))}
      (binding [sql/*query-timeout-seconds* 5]
        (let [patterns-to-test (atom [])
              ctx (assoc ctx
                         :datalog-query-fn (fn [c p]
                                             (swap! patterns-to-test conj {:ctx c
                                                                           :patterns p})
                                             (d/query c p))
                         ;; Prevent infinite cycle
                         :testing-rule-wheres true)

              ;; First, get the datalog query patterns for the query and rules
              _ (tracer/with-span! {:name "test-pg-hint-plan/initialize"}
                  (try
                    (permissioned-query-fn ctx o)
                    (catch Exception _e
                      nil)))]
          (doseq [{:keys [ctx patterns]} @patterns-to-test]
            (test-pg-hints-for-datalog-query ctx patterns o query-hash)))))))

(defn worth-testing? [_ctx _o query-hash]
  (and (flags/toggled? :test-pg-hint-plan)
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
        (try (apply test-pg-hints args)
             (catch Exception e
               (def -e e)
               nil)))
      (recur))))

(defn stop []
  (a/close! @process-chan))

(defn restart []
  (stop)
  (start))
