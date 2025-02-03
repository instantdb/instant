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
    (fn [{:keys [transact! get-entity-where resolve-id]}]
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
        {:id id})))))

(defn bulk-create!
  ([params] (bulk-create! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id data]}]
   (update-op
    conn
    {:app-id app-id
     :etype etype}
    (fn [{:keys [transact! resolve-id]}]
      ;; Insert in chunks to avoid exceeding max prepared statement size
      (doseq [chunk (partition-all 1000 data)]
        (let [triples
              (mapcat (fn [{:keys [file-id path metadata]}]
                        (let [{:keys [size content-type content-disposition]}
                              metadata]
                          [[:add-triple file-id (resolve-id :id) file-id]
                           [:add-triple file-id (resolve-id :path) path]
                           [:add-triple file-id (resolve-id :size) size]
                           [:add-triple file-id (resolve-id :content-type) content-type]
                           [:add-triple file-id (resolve-id :content-disposition) content-disposition]
                           [:add-triple file-id (resolve-id :key-version) 1]]))
                      chunk)]
          (transact! triples {:allow-$files-update? true})))
      {:ids (map :file-id data)}))))

(defn get-all-ids
  ([params] (get-all-ids (aurora/conn-pool :read) params))
  ([conn {:keys [app-id]}]
   (query-op conn
             {:app-id app-id
              :etype etype}
             (fn [{:keys [get-entities-where]}]
               (let [ents (get-entities-where {})]
                 {:ids (mapv :id ents)})))))

(defn get-by-path
  ([params] (get-by-path (aurora/conn-pool :read) params))
  ([conn {:keys [app-id path]}]
   (query-op conn
             {:app-id app-id
              :etype etype}
             (fn [{:keys [get-entity-where]}]
               (get-entity-where {:path path})))))

(defn get-by-paths
  ([params] (get-by-paths (aurora/conn-pool :read) params))
  ([conn {:keys [app-id paths]}]
   (query-op conn
             {:app-id app-id
              :etype etype}
             (fn [{:keys [get-entities-where]}]
               (->> (partition-all 1000 paths)
                    (mapcat #(get-entities-where {:path {:$in (vec %)}})))))))

(defn delete-by-ids!* [transact! etype ids]
  (let [res (transact! (mapv (fn [id]
                               [:delete-entity id etype])
                             ids)
                       {:allow-$files-update? true})]
    (->> (get-in res [:results :delete-entity])
         (map :triples/entity_id))))

(defn delete-by-ids!
  ([params] (delete-by-ids! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id ids]}]
   (update-op
    conn
    {:app-id app-id
     :etype etype}
    (fn [{:keys [transact!]}]
      (let [deleted-ids (mapcat #(delete-by-ids!* transact! etype %)
                                (partition-all 1000 ids))]
        {:ids deleted-ids})))))

(defn delete-by-paths!
  ([params] (delete-by-paths! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id paths]}]
   (let [ents (get-by-paths conn {:app-id app-id :paths paths})]
     (delete-by-ids! conn {:app-id app-id :ids (map :id ents)}))))

(defn delete-by-path!
  ([params] (delete-by-path! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id path]}]
   (update-op
    conn
    {:app-id app-id
     :etype etype}
    (fn [{:keys [transact! get-entity-where]}]
      (let [ent (get-entity-where {:path path})]
        (when (seq ent)
          (-> (transact! [[:delete-entity (:id ent) etype]]
                         {:allow-$files-update? true})
              (get-in [:results :delete-entity])
              first
              :triples/entity_id)))))))

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
       {:select [[[:count :t.*] :total_file_count]
                 [[:sum [[:triples_extract_number_value :t.value]]] :total_byte_size]]
        :from [[:triples :t]]
        :where [:and
                [:= :t.app_id app-id]
                [:= :t.attr_id fm-attr]
                [:= :t.checked-data-type [:cast "number" :checked_data_type]]
                :t.ave]})))))
