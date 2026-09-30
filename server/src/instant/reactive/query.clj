(ns instant.reactive.query
  "Layer between session and instaql. While executing instaql queries we persist
  mappings between session and queries inside the session store.

  We intentionally use side-effects to prevent missed updates for in-flight
  queries. See go-datalog-query-reactive! for more details. We also cache datalog
  query results for perf."
  (:require
   [instant.db.datalog :as d]
   [instant.db.instaql :as iq]
   [instant.db.instaql-topic :as iqt]
   [instant.db.model.attr :as attr-model]
   [instant.jdbc.aurora :as aurora]
   [instant.reactive.store :as rs]
   [instant.util.instaql :as instaql-util :refer [instaql-nodes->object-meta
                                 instaql-nodes->object-tree]]
   [instant.util.tracer :as tracer]
   [instant.comment :as c]
   [instant.flags :as flags]))

(defn- datalog-query-cached!
  "Returns the result of a datalog query. Leverages atom and
  delay to ensure queries are only run once in the face of concurrent requests."
  [store {:keys [app-id] :as ctx} datalog-query]
  (rs/swap-datalog-cache! store app-id d/query ctx datalog-query))

(comment
  (def z (c/zeneca-app!))
  (def z-id (:id z))
  (def ctx {:db {:conn-pool (aurora/conn-pool :read)}
            :app-id z-id})
  (def instaql-query '[[:ea ?e ?a "joe"]])
  (time
   (datalog-query-cached! rs/store ctx instaql-query)))

(defn- datalog-query-reactive!
  "When a datalog query is in-flight we may miss an update. To mitigate this
  race condition we record a coarse subscription before running the query. This way
  if an update does come in, the invalidator will see this subscription and mark
  it as stale.

  Once the query completes we refine the subscription with the resolved topics"
  [store ctx datalog-query]
  (if (:skip-cache? ctx)
    (d/query ctx datalog-query)
    (tracer/with-span! {:name "datalog-query-reactive!"
                        :attributes {:query (pr-str datalog-query)}}
      (let [coarse-topics (d/pats->coarse-topics datalog-query)
            _ (rs/record-datalog-query-start! store ctx datalog-query coarse-topics)
            datalog-result (datalog-query-cached! store ctx datalog-query)]
        (rs/record-datalog-query-finish! store ctx datalog-query datalog-result)
        datalog-result))))

(defn collect-triples [instaql-result]
  (let [join-rows (get-in instaql-result [:data :datalog-result :join-rows])
        join-row-triples (reduce into #{} join-rows)
        page-info (when-let [page-info (get-in instaql-result [:data :datalog-result :page-info])]
                    {(get-in instaql-result [:data :k]) page-info})

        aggregate (when-let [aggregate (get-in instaql-result [:data :datalog-result :aggregate])]
                    {(get-in instaql-result [:data :k]) aggregate})]
    (if-let [child-nodes (seq (:child-nodes instaql-result))]
      (reduce (fn [acc iql-result]
                ;; TODO: page-info and aggregate for child-nodes
                (let [{:keys [triples]} (collect-triples iql-result)]
                  (-> acc
                      (update :triples into triples))))
              {:triples join-row-triples
               :page-info page-info
               :aggregate aggregate}
              child-nodes)
      {:triples join-row-triples
       :page-info page-info
       :aggregate aggregate})))

(defn collect-instaql-results-for-client
  "Filters datalog results to only keys that the client will use and
 dedupes the triples."
  [instaql-results]
  (let [{:keys [triples page-info aggregate]}
        (reduce (fn [acc instaql-result]
                  (let [{:keys [triples page-info aggregate]} (collect-triples instaql-result)]
                    (-> acc
                        (update :triples into triples)
                        (update :page-info merge page-info)
                        (update :aggregate merge aggregate))))
                {:triples #{}
                 :page-info {}
                 :aggregate {}}
                instaql-results)]
    [{:data (merge {:datalog-result {:join-rows [triples]}}
                   (when (seq page-info)
                     {:page-info page-info})
                   (when (seq aggregate)
                     {:aggregate aggregate}))
      :child-nodes []}]))

(defn- collect-triples-into! [triples node]
  (let [triples (reduce (fn [triples row]
                         (reduce conj! triples row))
                       triples
                       (get-in node [:data :datalog-result :join-rows]))]
    (reduce collect-triples-into! triples (:child-nodes node))))

(defn- collect-instaql-results-with-transients [instaql-results]
  (let [{:keys [triples page-info aggregate]}
        (reduce (fn [acc node]
                  (let [{:keys [k datalog-result]} (:data node)]
                    (cond-> (update acc :triples collect-triples-into! node)
                      (:page-info datalog-result)
                      (assoc-in [:page-info k] (:page-info datalog-result))
                      (:aggregate datalog-result)
                      (assoc-in [:aggregate k] (:aggregate datalog-result)))))
                {:triples (transient #{}) :page-info {} :aggregate {}}
                instaql-results)]
    [{:data (merge {:datalog-result {:join-rows [(persistent! triples)]}}
                   (when (seq page-info) {:page-info page-info})
                   (when (seq aggregate) {:aggregate aggregate}))
      :child-nodes []}]))

(defn- compile-instaql-topic [attrs instaql-query]
  (when (flags/toggled? :instaql-topic-compiler true)
    (try
      (let [forms (iq/->forms! attrs instaql-query)
            result (iqt/instaql-topic {:attrs attrs} forms)]
        (when (:program result)
          result))
      (catch Throwable e
        (tracer/record-exception-span! e {:name "compile-instaql-topic-ex"})))))

(defn- skip-unchanged-result-enabled? [app-id query]
  ;; Each measured cohort can restore materialization without a deploy.
  (or (and (not (flags/toggled? :disable-scoped-refresh-results))
           (iq/seeks-query-cpu-enabled? app-id query :skip-unchanged))
      (and (= app-id #uuid "19bde4a4-559c-4274-9bba-5e4bff9fcffe")
           (not (flags/toggled? :disable-scoped-refresh-results))
           (true? (get-in (flags/flag :scoped-refresh-results)
                          [(str app-id) "sections-calendar"]))
           (false? (get-in query [:sections :$ :where :or 1 :and 0 :recurrenceRule :$isNull]))
           (= (instaql-util/normalized-forms query)
              {:sections {:$ {:where {:or [{:and [{:date {:$gte :string}}
                                                {:date {:$lte :string}}]}
                                          {:and [{:recurrenceRule {:$isNull :boolean}}
                                                 {:date {:$lte :string}}]}
                                          {:and [{:exceptionDate {:$gte :string}}
                                                 {:exceptionDate {:$lte :string}}]}]}}
                          :area {} :activityType {} :parent {} :eventLinks {}}}))))

(defn- transient-triple-collection-enabled? [app-id query]
  ;; Reuse the collector only for the measured query cohorts.
  (or (and (not (flags/toggled? :disable-scoped-triple-collection))
           (iq/seeks-query-cpu-enabled? app-id query :triple-collection))
      (and (= app-id #uuid "19bde4a4-559c-4274-9bba-5e4bff9fcffe")
           (not (flags/toggled? :disable-scoped-triple-collection))
           (true? (get-in (flags/flag :scoped-triple-collection)
                         [(str app-id) "sections-calendar"]))
           (false? (get-in query [:sections :$ :where :or 1 :and 0 :recurrenceRule :$isNull]))
           (= (instaql-util/normalized-forms query)
              {:sections {:$ {:where {:or [{:and [{:date {:$gte :string}}
                                                {:date {:$lte :string}}]}
                                          {:and [{:recurrenceRule {:$isNull :boolean}}
                                                 {:date {:$lte :string}}]}
                                          {:and [{:exceptionDate {:$gte :string}}
                                                 {:exceptionDate {:$lte :string}}]}]}}
                          :area {} :activityType {} :parent {} :eventLinks {}}}))))

(defn instaql-query-reactive!
  "Returns the result of an instaql query while producing book-keeping side
  effects in the store. Refreshes with :skip-unchanged-result? can omit unchanged
  payloads and metadata for an explicitly enabled app/query cohort."
  [store {:keys [session-id app-id attrs skip-unchanged-result?] :as base-ctx} instaql-query return-type inference?]
  (tracer/with-span! {:name "instaql-query-reactive!"
                      :attributes {:session-id session-id
                                   :app-id app-id
                                   :instaql-query instaql-query}}
    (try
      (let [iq-ent (rs/bump-instaql-version! store app-id session-id instaql-query return-type)
            v (:instaql-query/version iq-ent)
            iq-topic (or (:instaql-query/topic iq-ent)
                         (when-let [topic (compile-instaql-topic attrs instaql-query)]
                           (rs/set-instaql-topic! store app-id (:db/id iq-ent) topic)
                           topic))

            _ (tracer/add-data! {:attributes {:v v
                                              :iq-topic? (boolean iq-topic)}})
            ctx (-> base-ctx
                    (assoc :v v
                           :datalog-query-fn (partial datalog-query-reactive! store)
                           :instaql-query instaql-query)
                    ((fn [ctx]
                       (-> ctx
                           (assoc :record-datalog-query-start! (partial rs/record-datalog-query-start! store ctx)
                                  :record-datalog-query-finish! (partial rs/record-datalog-query-finish! store ctx))))))

            instaql-result (iq/permissioned-query ctx instaql-query)
            result-hash (hash {:instaql-result instaql-result
                               :attrs (attr-model/unwrap attrs)})
            {:keys [result-changed?]} (rs/add-instaql-query! store ctx result-hash)
            materialize? (or result-changed?
                             (not skip-unchanged-result?)
                             (not (skip-unchanged-result-enabled? app-id instaql-query)))]
        {:instaql-result (when materialize?
                           (case return-type
                             :join-rows (if (transient-triple-collection-enabled? app-id instaql-query)
                                          (collect-instaql-results-with-transients instaql-result)
                                          (collect-instaql-results-for-client instaql-result))
                             :tree (instaql-nodes->object-tree (assoc ctx :inference? inference?) instaql-result)
                             (collect-instaql-results-for-client instaql-result)))
         :result-meta (when (and materialize? (= :tree return-type))
                        (instaql-nodes->object-meta instaql-result))
         :result-changed? result-changed?
         :instaql-topic? (boolean iq-topic)})
      (catch Throwable e
        (rs/remove-query! store app-id session-id instaql-query)
        (throw e)))))

(comment
  (def z (c/zeneca-app!))
  (def z-id (:id z))
  (def ctx {:db {:conn-pool (aurora/conn-pool :read)}
            :attrs (attr-model/get-by-app-id z-id)
            :app-id z-id
            :current-user nil
            :session-id "moop"})
  (def instaql-query {"users" {}})
  (instaql-query-reactive! rs/store ctx instaql-query "join-rows" true))
