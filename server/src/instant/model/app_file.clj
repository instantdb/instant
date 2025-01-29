(ns instant.model.app-file
  (:require
   [instant.jdbc.aurora :as aurora]
   [instant.db.model.attr :as attr-model]
   [instant.system-catalog :refer [all-attrs] :rename {all-attrs $system-attrs}]
   [instant.system-catalog-ops :refer [update-op query-op]]
   [instant.jdbc.sql :as sql]
   [honey.sql :as hsql]
   [instant.util.exception :as ex]))

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
                         {:id (random-uuid)})
            {:keys [size content-type content-disposition]} metadata]
        (transact!
         [[:add-triple id (resolve-id :id) id]
          [:add-triple id (resolve-id :path) path]
          [:add-triple id (resolve-id :size) size]
          [:add-triple id (resolve-id :content-type) content-type]
          [:add-triple id (resolve-id :content-disposition) content-disposition]
          [:add-triple id (resolve-id :key-version) 1]]
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

(defn get-all-apps-usage
  ([] (get-all-apps-usage (aurora/conn-pool :read)))
  ([conn]
   (let [fm-attr (attr-model/resolve-attr-id $system-attrs "$files" "size")]
     (sql/select
      conn
      (hsql/format
       {:select [:t.app_id :a.title
                 [:u.email :creator_email]
                 [[:sum [[:triples_extract_number_value :t.value]]] :total_byte_size]
                 [[:count :t.*] :total_file_count]]
        :from [[:triples :t]]
        :join [[:apps :a] [:= :t.app_id :a.id]
               [:instant_users :u] [:= :a.creator_id :u.id]]
        :where [:and
                [:= :t.attr_id fm-attr]
                [:= :t.checked-data-type [:cast "number" :checked_data_type]]
                :t.ave]
        :group-by [:t.app_id :a.title :u.email]
        :order-by [[:total_byte_size :desc]]})))))

(defn get-app-usage
  ([app-id] (get-app-usage (aurora/conn-pool :read) app-id))
  ([conn app-id]
   (when (not (uuid? app-id))
     (ex/throw-validation-err! :app-id app-id "app-id must be a uuid"))
   (let [fm-attr (attr-model/resolve-attr-id $system-attrs "$files" "size")]
     (sql/select-one
      conn
      (hsql/format
       {:select [[[:sum [[:triples_extract_number_value :t.value]]] :total_byte_size]]
        :from [[:triples :t]]
        :where [:and
                [:= :t.app_id app-id]
                [:= :t.attr_id fm-attr]
                [:= :t.checked-data-type [:cast "number" :checked_data_type]]
                :t.ave]})))))
