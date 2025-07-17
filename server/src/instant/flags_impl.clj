;; Namespace that implements flags, kept separate from the flags
;; ns so that there are no cyclic depdencies
(ns instant.flags-impl
  (:require [instant.config :as config]
            [instant.db.datalog :as datalog]
            [instant.db.instaql :as instaql]
            [instant.db.model.attr :as attr-model]
            [instant.db.transaction :as tx]
            [instant.jdbc.aurora :as aurora]
            [instant.model.app :as app-model]
            [instant.reactive.receive-queue :as receive-queue]
            [instant.reactive.session :as session]
            [instant.reactive.store :as store]
            [instant.util.instaql :refer [instaql-nodes->object-tree]]
            [instant.util.json :refer [->json]]
            [instant.util.tracer :as tracer]))

(defn swap-result!
  "Updates the results atom, but only if we have a newer tx-id."
  [query-results-atom query transform result tx-id]
  (swap! query-results-atom update query (fn [existing]
                                           (if (and (:tx-id existing)
                                                    (< tx-id (:tx-id existing)))
                                             existing
                                             {:result (transform result) :tx-id tx-id}))))

(defn handle-msg [query-results-atom query->transform msg]
  (case (:op msg)
    :add-query-ok
    (let [{:keys [q result processed-tx-id]} msg]
      (swap-result! query-results-atom
                    q
                    (query->transform q)
                    result
                    (or processed-tx-id 0)))

    :refresh-ok
    (doseq [{:keys [instaql-query
                    instaql-result]}
            (:computations msg)]
      (swap-result! query-results-atom
                    instaql-query
                    (query->transform instaql-query)
                    instaql-result
                    (:processed-tx-id msg)))

    (tracer/record-info! {:name "flags-impl/unexpected-op"
                          :attributes {:op (:op msg)
                                       :msg msg}})))

(defn init
  "Creates a subscription to the config app, fetching all of the data."
  [config-app-id queries query-results-atom]
  (when-let [app (app-model/get-by-id {:id config-app-id})]
    (let [socket-id (random-uuid)
          attrs (attr-model/get-by-app-id config-app-id)
          ctx {:app-id (:id app)
               :attrs attrs
               :db {:conn-pool (aurora/conn-pool :read)}}
          query->transform (zipmap (map :query queries)
                                   (map :transform queries))
          ws-conn {:websocket-stub (fn [msg] (handle-msg query-results-atom
                                                         query->transform
                                                         msg))}
          socket {:id socket-id
                  :http-req nil
                  :ws-conn ws-conn
                  :receive-q receive-queue/receive-q
                  :pending-handlers (atom #{})}]

      ;; Get results in foreground so that flags are initialized before we return
      (doseq [{:keys [query transform]} queries
              :let [data (instaql/query ctx query)
                    result (instaql-nodes->object-tree ctx data)]]
        (swap-result! query-results-atom query transform result 0))

      (session/on-open store/store socket)
      (store/assoc-session! store/store
                            socket-id
                            :session/auth {:app app
                                           :admin? true})
      (doseq [{:keys [query]} queries]
        (session/on-message {:id socket-id
                             :receive-q receive-queue/receive-q
                             :data (->json {:op :add-query
                                            :q query
                                            :return-type "tree"})}))
      (fn []
        (session/on-close store/store socket)
        nil))))

(defn resolve-attr-id [attrs namespaced-attr]
  {:post [(uuid? %)]}
  (let [n [(name (namespace namespaced-attr)) (name namespaced-attr)]]
    (:id (or (attr-model/seek-by-fwd-ident-name n attrs)
             (attr-model/seek-by-rev-ident-name n attrs)))))

(defn mark-start-migrating-app-users [migrating-app-id]
  (when-let [config-app-id (config/instant-config-app-id)]
    (let [attrs (attr-model/get-by-app-id config-app-id)
          eid (random-uuid)
          id-attr-id (resolve-attr-id attrs
                                      :app-users-to-triples-migration/id)
          app-id-attr-id (resolve-attr-id attrs
                                          :app-users-to-triples-migration/appId)
          machine-attr-id (resolve-attr-id
                           attrs
                           :app-users-to-triples-migration/processId)]
      (tx/transact! (aurora/conn-pool :write)
                    attrs
                    config-app-id
                    [[:add-triple eid id-attr-id eid]
                     [:add-triple eid app-id-attr-id migrating-app-id]
                     [:add-triple eid machine-attr-id @config/process-id]]))))

(defn mark-end-migrating-app-users [migrating-app-id]
  (when-let [config-app-id (config/instant-config-app-id)]
    (let [attrs (attr-model/get-by-app-id config-app-id)
          app-id-attr-id (resolve-attr-id attrs
                                          :app-users-to-triples-migration/appId)
          machine-attr-id (resolve-attr-id
                           attrs
                           :app-users-to-triples-migration/processId)
          ctx {:attrs attrs
               :db {:conn-pool (aurora/conn-pool :read)}
               :app-id config-app-id}
          eids (-> (datalog/query ctx [[:ea '?e]
                                       [:ea '?e #{machine-attr-id} #{@config/process-id}]
                                       [:ea '?e #{app-id-attr-id} #{migrating-app-id}]])
                   :symbol-values
                   (get '?e))]
      (when (seq eids)
        (tx/transact! (aurora/conn-pool :write)
                      attrs
                      config-app-id
                      (map (fn [eid]
                             [:delete-entity
                              eid
                              "app-users-to-triples-migration"])
                           eids))))))
