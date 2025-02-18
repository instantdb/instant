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
  ([conn {:keys [app-id path location-id metadata]}]
   (update-op
    conn
    {:app-id app-id
     :etype etype}
    (fn [{:keys [transact! resolve-id]}]
      (let [lookup [(resolve-id :path) path]
            {:keys [size content-type content-disposition]} metadata

            res
            (transact!
             [[:add-triple lookup (resolve-id :id) lookup]
              [:add-triple lookup (resolve-id :size) size]
              [:add-triple lookup (resolve-id :content-type) content-type]
              [:add-triple lookup (resolve-id :content-disposition) content-disposition]
              [:add-triple lookup (resolve-id :location-id) location-id]
              [:add-triple lookup (resolve-id :key-version) 1]]
             {:allow-$files-update? true})]
        {:id (->> (get-in res [:results :add-triple])
                  (map :entity_id)
                  first)})))))

(comment
  (create! {:app-id #uuid "2d960014-0690-4dc5-b13f-a3c202663241"
            :path "circle_red.jpg"
            :location-id "circle_red.jpg"
            :metadata {:size 123
                       :content-type "image/jpeg"
                       :content-disposition "inline"}})
  (create! {:app-id #uuid "2d960014-0690-4dc5-b13f-a3c202663241"
            :path "circle_blue.jpg"
            :location-id "circle_blue.jpg"
            :metadata {:size 123
                       :content-type "image/jpeg"
                       :content-disposition "inline"}}))

(defn bulk-add-locations!
  ([params] (bulk-add-locations! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id locations-map]}]
   (update-op
    conn
    {:app-id app-id
     :etype etype}
    (fn [{:keys [transact! resolve-id]}]
      (let [location-attr-id (resolve-id :location-id)]
        (transact!
         (map (fn [{:keys [id location-id]}]
                [:add-triple id location-attr-id location-id])
              locations-map)
         {:allow-$files-update? true}))))))

(comment
  (bulk-add-locations!
   {:app-id #uuid "831355ee-6a59-4990-8ef3-9c9fe7c26031"
    :locations-map [{:id #uuid "0036438b-e510-47bf-b62f-835a1cefb392"
                     :location-id "circle_red.jpg"}
                    {:id #uuid "007b2d37-3687-4641-a89f-ffd03876b34f"
                     :location-id "circle_blue.jpg"}]}))

(defn add-location!
  ([params] (add-location! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id id location-id]}]
   (update-op
    conn
    {:app-id app-id
     :etype etype}
    (fn [{:keys [transact! resolve-id]}]
      (transact!
       [[:add-triple id (resolve-id :location-id) location-id]]
       {:allow-$files-update? true})))))

(comment
  (add-location! {:app-id #uuid "831355ee-6a59-4990-8ef3-9c9fe7c26031"
                  :id #uuid "0036438b-e510-47bf-b62f-835a1cefb392"
                  :location-id "circle_red.jpg"}))

(defn bulk-update-metadata!
  ([params] (bulk-update-metadata! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id metadatas-map]}]
   (update-op
    conn
    {:app-id app-id
     :etype etype}
    (fn [{:keys [transact! resolve-id]}]
      (let [content-type-attr-id (resolve-id :content-type)
            content-disposition-attr-id (resolve-id :content-disposition)
            triples (mapcat (fn [{:keys [id content-type content-disposition]}]
                              (cond-> []
                                content-type
                                (conj [:add-triple id content-type-attr-id content-type])

                                content-disposition
                                (conj [:add-triple id content-disposition-attr-id content-disposition])))
                            metadatas-map)]
        (transact! triples {:allow-$files-update? true}))))))

(defn bulk-create!
  ([params] (bulk-create! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id data]}]
   (update-op
    conn
    {:app-id app-id
     :etype etype}
    (fn [{:keys [transact! resolve-id]}]
      (let [triples
            (mapcat (fn [{:keys [file-id path location-id metadata]}]
                      (let [{:keys [size content-type content-disposition]}
                            metadata]
                        [[:add-triple file-id (resolve-id :id) file-id]
                         [:add-triple file-id (resolve-id :path) path]
                         [:add-triple file-id (resolve-id :size) size]
                         [:add-triple file-id (resolve-id :content-type) content-type]
                         [:add-triple file-id (resolve-id :content-disposition) content-disposition]
                         [:add-triple file-id (resolve-id :location-id) location-id]
                         [:add-triple file-id (resolve-id :key-version) 1]]))
                    data)
            res (transact! triples {:allow-$files-update? true})]
        (->> (get-in res [:results :add-triple])
             (map :entity_id)
             set))))))

(defn get-where
  ([params] (get-where (aurora/conn-pool :read) params))
  ([conn {:keys [app-id where]}]
   (query-op conn
             {:app-id app-id
              :etype etype}
             (fn [{:keys [get-entities-where]}]
               (get-entities-where (or where {}))))))

(comment
  (get-where {:app-id #uuid "831355ee-6a59-4990-8ef3-9c9fe7c26031"
              :where {:location-id {:$isNull true}}}))

(defn get-by-id
  ([params] (get-by-id (aurora/conn-pool :read) params))
  ([conn {:keys [app-id id]}]
   (query-op conn
             {:app-id app-id
              :etype etype}
             (fn [{:keys [get-entity]}]
               (get-entity id)))))

(defn get-by-path
  ([params] (get-by-path (aurora/conn-pool :read) params))
  ([conn {:keys [app-id path]}]
   (query-op conn
             {:app-id app-id
              :etype etype}
             (fn [{:keys [get-entity resolve-id]}]
               (get-entity [(resolve-id :path) path])))))

(comment
  (get-by-path {:app-id #uuid "2d960014-0690-4dc5-b13f-a3c202663241"
                :path "circle_blue.jpg"}))

(defn get-by-paths
  ([params] (get-by-paths (aurora/conn-pool :read) params))
  ([conn {:keys [app-id paths]}]
   (query-op conn
             {:app-id app-id
              :etype etype}
             (fn [{:keys [get-entities-where]}]
               (get-entities-where {:path {:$in (vec paths)}})))))

(comment
  (get-by-paths {:app-id #uuid "2d960014-0690-4dc5-b13f-a3c202663241"
                 :paths ["circle_blue.jpg" "circle_red.jpg"]}))

(defn delete-by-ids!
  ([params] (delete-by-ids! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id ids]}]
   (update-op
    conn
    {:app-id app-id
     :etype etype}
    (fn [{:keys [delete-entities!]}]
      (delete-entities! ids {:allow-$files-update? true})))))

(defn delete-by-path!
  ([params] (delete-by-path! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id path]}]
   (update-op
    conn
    {:app-id app-id
     :etype etype}
    (fn [{:keys [resolve-id delete-entity!]}]
      (delete-entity! [(resolve-id :path) path]
                      {:allow-$files-update? true})))))

(comment
  (delete-by-path!
   {:app-id #uuid "2d960014-0690-4dc5-b13f-a3c202663241"
    :path "circle_red.jpg"}))

(defn delete-by-paths!
  ([params] (delete-by-paths! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id paths]}]
   (update-op
    conn
    {:app-id app-id
     :etype etype}
    (fn [{:keys [delete-entities! resolve-id]}]
      (let [path-attr-id (resolve-id :path)
            lookups (map #(vector path-attr-id %) paths)]
        (delete-entities! lookups {:allow-$files-update? true}))))))

(comment
  (delete-by-paths!
   {:app-id #uuid "2d960014-0690-4dc5-b13f-a3c202663241"
    :paths ["circle_blue.jpg" "circle_red.jpg"]}))

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
