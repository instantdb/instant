(ns instant.reactive.where-clause-invalidation-test
  "Test to understand how where-clause queries get invalidated.

   This test creates items and workspaces, runs a query with a where clause
   filtering by workspace, then creates a new item and checks what topics
   are generated and whether the query would be invalidated."
  (:require
   [clojure.string :as string]
   [clojure.test :as test :refer [deftest]]
   [clojure.pprint :as pprint]
   [instant.fixtures :refer [with-empty-app]]
   [instant.db.instaql :as iq]
   [instant.db.datalog :as d]
   [instant.db.model.attr :as attr-model]
   [instant.db.transaction :as tx]
   [instant.jdbc.aurora :as aurora]
   [instant.reactive.invalidator :as inv]
   [instant.reactive.store :as rs]
   [instant.reactive.topics :as topics]
   [instant.data.resolvers :as resolvers]))

(defn create-schema!
  "Creates the schema for items and workspaces with a link between them.
   Returns the attr-id map."
  [app-id]
  (let [conn (aurora/conn-pool :write)
        items-id-attr-id (random-uuid)
        items-title-attr-id (random-uuid)
        items-is-deleted-attr-id (random-uuid)
        workspaces-id-attr-id (random-uuid)
        workspaces-name-attr-id (random-uuid)
        items-workspaces-attr-id (random-uuid)]

    (tx/transact! conn
                  (attr-model/get-by-app-id app-id)
                  app-id
                  [[:add-attr {:id items-id-attr-id
                              :forward-identity [(random-uuid) "items" "id"]
                              :value-type :blob
                              :cardinality :one
                              :unique? true
                              :index? true}]
                   [:add-attr {:id items-title-attr-id
                              :forward-identity [(random-uuid) "items" "title"]
                              :value-type :blob
                              :cardinality :one
                              :unique? false
                              :index? false}]
                   [:add-attr {:id items-is-deleted-attr-id
                              :forward-identity [(random-uuid) "items" "isDeleted"]
                              :value-type :blob
                              :cardinality :one
                              :unique? false
                              :index? true}]
                   [:add-attr {:id workspaces-id-attr-id
                              :forward-identity [(random-uuid) "workspaces" "id"]
                              :value-type :blob
                              :cardinality :one
                              :unique? true
                              :index? true}]
                   [:add-attr {:id workspaces-name-attr-id
                              :forward-identity [(random-uuid) "workspaces" "name"]
                              :value-type :blob
                              :cardinality :one
                              :unique? false
                              :index? false}]
                   [:add-attr {:id items-workspaces-attr-id
                              :forward-identity [(random-uuid) "items" "workspaces"]
                              :reverse-identity [(random-uuid) "workspaces" "items"]
                              :value-type :ref
                              :cardinality :one
                              :unique? false
                              :index? false}]])

    {:items/id items-id-attr-id
     :items/title items-title-attr-id
     :items/isDeleted items-is-deleted-attr-id
     :workspaces/id workspaces-id-attr-id
     :workspaces/name workspaces-name-attr-id
     :items/workspaces items-workspaces-attr-id}))

(defn create-test-data!
  "Creates 2 workspaces and 1 item linked to workspace-1.
   Returns the entity ids."
  [app-id attrs attr-ids]
  (let [conn (aurora/conn-pool :write)
        workspace-1-id (random-uuid)
        workspace-2-id (random-uuid)
        item-1-id (random-uuid)]

    (tx/transact! conn attrs app-id
                  [[:add-triple workspace-1-id (:workspaces/id attr-ids) workspace-1-id]
                   [:add-triple workspace-1-id (:workspaces/name attr-ids) "Workspace 1"]])

    (tx/transact! conn attrs app-id
                  [[:add-triple workspace-2-id (:workspaces/id attr-ids) workspace-2-id]
                   [:add-triple workspace-2-id (:workspaces/name attr-ids) "Workspace 2"]])

    (tx/transact! conn attrs app-id
                  [[:add-triple item-1-id (:items/id attr-ids) item-1-id]
                   [:add-triple item-1-id (:items/title attr-ids) "Item 1"]
                   [:add-triple item-1-id (:items/workspaces attr-ids) workspace-1-id]])

    {:workspace-1-id workspace-1-id
     :workspace-2-id workspace-2-id
     :item-1-id item-1-id}))

(defn run-query-and-get-topics
  "Runs an InstaQL query and captures the topics from the datalog query.
   Returns {:result ... :topics ...}"
  [app-id attrs query]
  (let [captured-topics (atom nil)
        capturing-datalog-query-fn (fn [ctx patterns]
                                     (let [result (d/query ctx patterns)]
                                       (when-let [topics (:topics result)]
                                         (swap! captured-topics (fnil into #{}) topics))
                                       result))
        ctx {:db {:conn-pool (aurora/conn-pool :read)}
             :app-id app-id
             :attrs attrs
             :datalog-query-fn capturing-datalog-query-fn
             :current-user nil}
        result (iq/query ctx query)]
    {:result result
     :topics @captured-topics}))

(defn with-wal-capture
  "Executes body function while capturing all WAL records for the given app.
   Returns {:result <return-value-of-f> :wal-records [...]}"
  [app-id f]
  (let [invalidate! (var-get #'inv/invalidate!)
        records (atom [])
        machine-id (string/replace (str "test-" (random-uuid)) #"-" "_")]
    (with-redefs [inv/invalidate!
                  (fn [process-id store {:keys [app-id tx-id] :as wal-record}]
                    (if (= machine-id process-id)
                      (swap! records conj wal-record)
                      (invalidate! process-id store wal-record)))]
      (let [process (inv/start machine-id)]
        (try
          (let [result (f)]
            (Thread/sleep 500)
            {:result result
             :wal-records @records})
          (finally
            (inv/stop process)))))))

(deftest where-clause-invalidation-test
  (with-empty-app
    (fn [{app-id :id}]
      (let [;; 1. Create schema
            attr-ids (create-schema! app-id)
            attrs (attr-model/get-by-app-id app-id)

            ;; 2. Create test data: 2 workspaces, 1 item linked to workspace-1
            {:keys [workspace-1-id workspace-2-id item-1-id]}
            (create-test-data! app-id attrs attr-ids)

            ;; Refresh attrs after creating data
            attrs (attr-model/get-by-app-id app-id)

            ;; 3. Build the InstaQL query: items where workspaces = workspace-1-id AND isDeleted is null
            query {:items {:$ {:where {:workspaces workspace-1-id
                                       :isDeleted {:$isNull true}}}}}

            ;; 4. Run the query and get topics
            {:keys [topics]} (run-query-and-get-topics app-id attrs query)
            query-topics topics

            ;; 5. Create a NEW item (NOT linked to any workspace) and capture WAL
            new-item-id (random-uuid)
            {:keys [wal-records]}
            (with-wal-capture
              app-id
              (fn []
                (tx/transact! (aurora/conn-pool :write)
                              attrs
                              app-id
                              [[:add-triple new-item-id (:items/id attr-ids) new-item-id]
                               [:add-triple new-item-id (:items/title attr-ids) "New Item"]])))

            wal-topics (set (mapcat topics/topics-for-changes wal-records))

            ;; 6. Check for match
            matched? (when (and (seq wal-topics) (seq query-topics))
                       (rs/matching-topic-intersection? wal-topics query-topics))

            ;; 7. Create resolver AFTER all data exists (so it knows about all entity IDs)
            r (resolvers/make-resolver {:conn-pool (aurora/conn-pool :read)}
                                       app-id
                                       [["items" "title"]
                                        ["workspaces" "name"]])

            ;; 8. Make topics pretty with resolver
            pretty-query-topics (resolvers/walk-friendly r query-topics)
            pretty-wal-topics (resolvers/walk-friendly r wal-topics)

            ;; Build result
            result {:query (resolvers/walk-friendly r query)
                    :query-topics pretty-query-topics
                    :wal-topics pretty-wal-topics
                    :matched? (boolean matched?)}]

        ;; Print for visibility
        (println "\n=== WHERE CLAUSE INVALIDATION TEST ===")
        (println "\nQuery:")
        (pprint/pprint (resolvers/walk-friendly r query))
        (println "\nQuery Topics:")
        (pprint/pprint pretty-query-topics)
        (println "\nWAL Topics (from creating new item NOT linked to workspace-1):")
        (pprint/pprint pretty-wal-topics)
        (println "\nMatched?:" (boolean matched?))
        (println "\n=======================================\n")

        ;; Return result for REPL use
        result))))

(comment
  (test/run-tests *ns*)

  (where-clause-invalidation-test))
