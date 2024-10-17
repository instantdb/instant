;; Namespace that implements flags, kept separate from the flags
;; ns so that there are no cyclic depdencies
(ns instant.flags-impl
  (:require [instant.db.instaql :as instaql]
            [instant.db.model.attr :as attr-model]
            [instant.jdbc.aurora :as aurora]
            [instant.model.app :as app-model]
            [instant.reactive.ephemeral :as eph]
            [instant.reactive.session :as session]
            [instant.reactive.store :as store]
            [instant.util.instaql :refer [instaql-nodes->object-tree]]
            [instant.util.tracer :as tracer]
            [instant.util.json :refer [->json]]))

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
                          :op (:op msg)
                          :msg msg})))

(defn init
  "Creates a subscription to the config app, fetching all of the data."
  [config-app-id queries query-results-atom]
  (when-let [app (app-model/get-by-id {:id config-app-id})]
    (let [socket-id (random-uuid)
          attrs (attr-model/get-by-app-id config-app-id)
          ctx {:app-id (:id app)
               :attrs attrs
               :db {:conn-pool aurora/conn-pool}}
          query->transform (zipmap (map :query queries)
                                   (map :transform queries))
          ws-conn {:websocket-stub (fn [msg] (handle-msg query-results-atom
                                                         query->transform
                                                         msg))}
          socket {:id socket-id
                  :http-req nil
                  :ws-conn ws-conn
                  :receive-q session/receive-q
                  :pending-handlers (atom #{})}]

      ;; Get results in foreground so that flags are initialized before we return
      (doseq [{:keys [query transform]} queries
              :let [data (instaql/query ctx query)
                    result (instaql-nodes->object-tree ctx data)]]
        (swap-result! query-results-atom query transform result 0))

      (session/on-open store/store-conn socket)
      (store/set-auth! store/store-conn
                       socket-id
                       {:app app
                        :admin? true})
      (doseq [{:keys [query]} queries]
        (session/on-message {:id socket-id
                             :receive-q session/receive-q
                             :data (->json {:op :add-query
                                            :q query
                                            :return-type "tree"})}))
      (fn []
        (session/on-close store/store-conn
                          eph/ephemeral-store-atom
                          socket)
        nil))))
