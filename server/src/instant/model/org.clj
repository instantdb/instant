(ns instant.model.org
  (:require
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.model.app :as app-model]
   [instant.util.exception :as ex]
   [instant.util.hsql :as uhsql]))

(def by-id-q
  (uhsql/preformat {:select :*
                    :from :orgs
                    :where [:= :id :?id]}))

(defn get-by-id
  ([params] (get-by-id (aurora/conn-pool :read) params))
  ([conn {:keys [id]}]
   (let [params {:id id}
         query (uhsql/formatp by-id-q params)]
     (sql/select-one ::get-by-id conn query))))

(defn get-by-id!
  ([params] (get-by-id! (aurora/conn-pool :read) params))
  ([conn {:keys [id]}]
   (ex/assert-record! (get-by-id {:id id})
                      :org
                      {:args [{:id id}]})))

(def all-for-user-q
  (uhsql/preformat {:select [:o.id
                             :o.title
                             :o.created-at
                             :o.updated-at
                             :m.role
                             [[:coalesce [:= :3 :s.subscription_type_id] false] :paid]]
                    :from [[:orgs :o]]
                    :join [[:org-members :m] [:and
                                              [:= :m.org_id :o.id]]]
                    :left-join [[:instant-subscriptions :s] [:= :o.subscription-id :s.id]]
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
                                  [:= :o.id :?org-id]]}))

(defn apps-for-org
  ([params] (apps-for-org (aurora/conn-pool :read) params))
  ([conn {:keys [user-id org-id]}]
   (let [params {:user-id user-id
                 :org-id org-id}
         query (uhsql/formatp apps-for-org-q params)]
     (sql/select ::apps-for-org conn query))))

(def members-for-org-q
  (uhsql/preformat
   {:select [:m.id :u.email :m.role]
    :from [[:org-members :m]]
    :join [[:orgs :o] [:= :m.org_id :o.id]
           [:org-members :m-user] [:= :m-user.org-id :o.id]
           [:instant-users :u] [:= :m.user-id :u.id]]
    :where [:and
            [:= :m-user.user-id :?user-id]
            [:= :o.id :?org-id]]}))

(defn members-for-org
  ([params] (members-for-org (aurora/conn-pool :read) params))
  ([conn {:keys [user-id org-id]}]
   (let [params {:user-id user-id
                 :org-id org-id}
         query (uhsql/formatp members-for-org-q params)]
     (sql/select ::members-for-org conn query))))

(def invites-for-org-q
  (uhsql/preformat
   {:select [:i.id
             [:i.invitee_email :email]
             [:i.invitee_role :role]
             :i.status
             :i.sent_at
             [[:< :i.sent_at [:- :%now [:interval "3 days"]]]
              :expired]]
    :from [[:org-member-invites :i]]
    :join [[:orgs :o] [:= :i.org_id :o.id]
           [:org-members :m-user] [:= :m-user.org-id :o.id]]
    :where [:and
            [:= :m-user.user-id :?user-id]
            [:= :o.id :?org-id]]}))

(defn invites-for-org
  ([params] (invites-for-org (aurora/conn-pool :read) params))
  ([conn {:keys [user-id org-id]}]
   (let [params {:user-id user-id
                 :org-id org-id}
         query (uhsql/formatp invites-for-org-q params)]
     (sql/select ::invites-for-org conn query))))


(def org-for-user-q
  (uhsql/preformat {:select [:o.id
                             :o.title
                             :o.created-at
                             :o.updated-at
                             :m.role
                             [[:coalesce [:= :3 :s.subscription_type_id] false] :paid]]
                    :from [[:orgs :o]]
                    :join [[:org-members :m] [:= :o.id :m.org-id]]
                    :left-join [[:instant-subscriptions :s] [:= :o.subscription-id :s.id]]
                    :where [:and
                            [:= :m.user-id :?user-id]
                            [:= :o.id :?org-id]]}))

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
