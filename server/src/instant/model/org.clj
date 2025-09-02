(ns instant.model.org
  (:require
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.model.app :as app-model]
   [instant.util.exception :as ex]
   [instant.util.hsql :as uhsql]))

(def all-for-user-q
  (uhsql/preformat {:select [:o.id :o.title :o.created-at :o.updated-at :m.role]
                    :from [[:orgs :o]]
                    :join [[:org-members :m] [:and
                                              [:= :m.org_id :o.id]]]
                    :where [:= :m.user-id :?user-id]}))

(defn get-all-for-user
  ([params] (get-all-for-user (aurora/conn-pool :read) params))
  ([conn {:keys [user-id]}]
   (let [params {:user-id user-id}
         query (uhsql/formatp all-for-user-q params)]
     (sql/select ::get-all-for-user conn query))))

(def apps-for-org-q
  (app-model/make-apps-q {:select :a.id
                          :from [[:apps :a]]
                          :join [[:orgs :o] [:= :a.org_id :o.id]
                                 [:org-members :m] [:= :m.org-id :o.id]]
                          :where [:and
                                  [:= :m.user-id :?user-id]
                                  [:= :m.org-id :?org-id]]}))

(defn apps-for-org
  ([params] (apps-for-org (aurora/conn-pool :read) params))
  ([conn {:keys [user-id org-id]}]
   (let [params {:user-id user-id
                 :org-id org-id}
         query (uhsql/formatp apps-for-org-q params)]
     (sql/select ::apps-for-org conn query))))

(def org-for-user-q
  (uhsql/preformat {:select [:o.id :o.title :o.created-at :o.updated-at :m.role]
                    :from [[:orgs :o]]
                    :join [[:org-members :m] [:= :o.id :m.org-id]]
                    :where [:= :m.user-id :?user-id]}))

(defn get-org-for-user!
  ([params] (get-org-for-user! (aurora/conn-pool :read) params))
  ([conn {:keys [org-id user-id]}]
   (let [params {:user-id user-id
                 :org-id org-id}
         query (uhsql/formatp org-for-user-q params)]
     (some-> (sql/select-one ::get-org-for-user! conn query)
             (update :role keyword)
             (ex/assert-record! :org {:args [{:user-id user-id
                                              :org-id org-id}]})))))


(def create-org-q
  (uhsql/preformat {:with [[:org {:insert-into :orgs
                                  :values [{:id :?org-id
                                            :title :?title}]
                                  :returning :*}]
                           [:member {:insert-into :org-members
                                     :values [{:id :?member-id
                                               :org-id :?org-id
                                               :user-id :?user-id
                                               :role [:inline "owner"]}]}]]
                    :select [:id :title :created-at :updated-at]
                    :from :org}))

(defn create!
  ([params] (create! (aurora/conn-pool :write) params))
  ([conn {:keys [user-id
                 title]}]
   (let [params {:user-id user-id
                 :org-id (random-uuid)
                 :member-id (random-uuid)
                 :title title}
         query (uhsql/formatp create-org-q params)]
     (sql/execute-one! ::create! conn query))))

(def delete-org-q
  (uhsql/preformat {:delete-from :orgs
                    :where [:= :id :?org-id]
                    :returning :*}))

(defn delete!
  ([params] (delete! (aurora/conn-pool :write) params))
  ([conn {:keys [org-id]}]
   (let [params {:org-id org-id}
         query (uhsql/formatp delete-org-q params)]
     (sql/execute-one! ::delete! conn query))))
