(ns instant.model.app-file
  (:require
   [instant.jdbc.aurora :as aurora]
   [instant.db.model.attr :as attr-model]
   [instant.system-catalog :refer [all-attrs] :rename {all-attrs $system-attrs}]
   [instant.system-catalog-ops :refer [update-op query-op]]
   [instant.jdbc.sql :as sql]
   [honey.sql :as hsql]))

(def etype "$files")

(defn create!
  ([params] (create! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id path metadata]}]
   (update-op
    conn
    {:app-id app-id
     :etype etype}
    (fn [{:keys [transact! get-entity-where resolve-id get-entity]}]
      (let [{id :id} (or (get-entity-where {:path path})
                         {:id (random-uuid)})]
        (transact! [[:add-triple id (resolve-id :id) id]
                    [:add-triple id (resolve-id :path) path]
                    [:add-triple id (resolve-id :metadata) metadata]]
                   {:allow-$files-update? true})
        (get-entity id))))))

(defn get-by-path
  ([params] (get-by-path (aurora/conn-pool :read) params))
  ([conn {:keys [app-id path]}]
   (query-op conn
             {:app-id app-id
              :etype etype}
             (fn [{:keys [get-entity-where]}]
               (get-entity-where {:path path})))))

(defn delete-by-paths!
  ([params] (delete-by-paths! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id paths]}]
   (update-op
    conn
    {:app-id app-id
     :etype etype}
    (fn [{:keys [transact! get-entities-where]}]
      (let [ents (get-entities-where {:path {:$in paths}})]
        (when (seq ents)
          (transact! (mapv (fn [{:keys [id]}]
                             [:delete-entity id etype])
                           ents)
                     {:allow-$files-update? true})))))))

(defn delete-by-path!
  ([params] (delete-by-path! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id path]}]
   (delete-by-paths! conn {:app-id app-id :paths [path]})))

(defn delete-by-ids!
  ([params] (delete-by-ids! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id ids]}]
   (update-op
    conn
    {:app-id app-id
     :etype etype}
    (fn [{:keys [transact! get-entities-where]}]
      (let [ents (get-entities-where {:id {:$in ids}})]
        (when (seq ents)
          (transact! (mapv (fn [{:keys [id]}]
                             [:delete-entity id etype])
                           ents)
                     {:allow-$files-update? true})))))))

(comment
  (delete-by-ids! {:app-id #uuid "831355ee-6a59-4990-8ef3-9c9fe7c26031"
                   :ids [#uuid "cbda1941-d192-4f7d-b0a7-f9d428e1ca0b"]})
  (let [{app-id :app_id path :path} (get-by-path {:app-id #uuid "831355ee-6a59-4990-8ef3-9c9fe7c26031"
                                                  :path "circle_red.jpg"})]
    (delete-by-path! {:app-id app-id :path path})))

(defn get-usage* [conn app-id]
  {:pre [(or (nil? app-id) (uuid? app-id))]}
  (let [fm-attr (attr-model/resolve-attr-id $system-attrs "$files" "metadata")
        where (if app-id
                [:and
                 [:= :t.attr_id fm-attr]
                 [:= :t.app_id app-id]]
                [:= :t.attr_id fm-attr])]
    (sql/select conn
                (hsql/format
                 {:select [:t.app_id :a.title
                           [:u.email :creator_email]
                           [[:sum [[:cast [:-> :t.value "size"] :bigint]]] :total_byte_size]
                           [[:count :t.*] :total_file_count]]
                  :from [[:triples :t]]
                  :join [[:apps :a] [:= :t.app_id :a.id]
                         [:instant_users :u] [:= :a.creator_id :u.id]]
                  :where where
                  :group-by [:t.app_id :a.title :u.email]
                  :order-by [[:total_byte_size :desc]]}))))

(defn get-all-apps-usage
  ([] (get-all-apps-usage (aurora/conn-pool :read)))
  ([conn] (get-usage* conn nil)))

(defn get-app-usage
  ([app-id] (get-app-usage (aurora/conn-pool :read) app-id))
  ([conn app-id] (first (get-usage* conn app-id))))
