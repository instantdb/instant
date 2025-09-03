(ns instant.model.member-invites
  (:require
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.util.exception :as ex]
   [instant.util.hsql :as uhsql]))

(defn tbl [app-or-org]
  (case app-or-org
    :app :app_member_invites
    :org :org_member_invites))

(defn fk [app-or-org]
  (case app-or-org
    :app :app_id
    :org :org_id))

(defn make-create-q [app-or-org]
  (uhsql/preformat
   {:insert-into (tbl app-or-org)
    :values [{:id :?id
              (fk app-or-org) :?foreign-key
              :inviter_id :?inviter-id
              :invitee_email :?email
              :invitee_role :?role
              :status [:inline "pending"]
              :sent_at :%now}]
    :on-conflict [(fk app-or-org) :invitee_email]
    :do-update-set {:status [:inline "pending"]
                    :sent_at :%now
                    :invitee_role :?role}}))

(def create-qs {:app (make-create-q :app)
                :org (make-create-q :org)})

(defn create!
  ([params] (create! (aurora/conn-pool :write) params))
  ([conn {:keys [type foreign-key inviter-id email role]}]
   (let [params {:id (random-uuid)
                 :foreign-key foreign-key
                 :inviter-id inviter-id
                 :email email
                 :role role}
         query (uhsql/formatp (create-qs type) params)]
     (sql/execute-one! conn query))))

(defn make-get-by-id-q [app-or-org]
  (uhsql/preformat {:select :*
                    :from (tbl app-or-org)
                    :where [:= :id :?id]}))

(def get-by-id-qs {:app (make-get-by-id-q :app)
                   :org (make-get-by-id-q :org)})

(defn get-by-id
  ([params] (get-by-id (aurora/conn-pool :read) params))
  ([conn {:keys [id]}]
   (or
    (when-let [record
               (sql/select-one ::get-by-id-app
                               conn
                               (uhsql/formatp (:app get-by-id-qs) {:id id}))]
      (assoc record :type :app))
    (when-let [record
               (sql/select-one ::get-by-id-org
                               conn
                               (uhsql/formatp (:org get-by-id-qs) {:id id}))]
      (assoc record :type :org)))))

(defn get-by-id!
  ([params] (get-by-id! (aurora/conn-pool :read) params))
  ([conn params]
   (ex/assert-record!
    (get-by-id conn params)
    :member-invite
    {:args [params]})))

(def pending-for-invitee-q
  (uhsql/preformat
   {:union [{:select [[[:inline "app"] :type]
                      :i.id
                      :i.invitee_role
                      [:a.id :app_id] ; TODO: remove after frontend updates
                      [:a.id :foreign_key]
                      [:a.title :app_title] ; TODO: remove after frontend updates
                      [:a.title :title]
                      [:u.email :inviter_email]]
             :from [[:app_member_invites :i]]
             :join [[:apps :a] [:= :a.id :i.app_id]
                    [:instant_users :u] [:= :i.inviter_id :u.id]]
             :where [:and
                     [:= :i.invitee-email :?email]
                     [:= :i.status [:inline "pending"]]
                     [:>= :i.sent_at [:- :%now [:interval [:inline "3 days"]]]]]}
            {:select [[[:inline "org"] :type]
                      :i.id
                      :i.invitee_role

                      [nil :app_id] ; TODO: remove after frontend updates
                      [:o.id :foreign_key]
                      [:o.title :app_title] ; TODO: remove after frontend updates
                      [:o.title :title]
                      [:u.email :inviter_email]]
             :from [[:org_member_invites :i]]
             :join [[:orgs :o] [:= :o.id :i.org_id]
                    [:instant_users :u] [:= :i.inviter_id :u.id]]
             :where [:and
                     [:= :i.invitee-email :?email]
                     [:= :i.status [:inline "pending"]]
                     [:>= :i.sent_at [:- :%now [:interval [:inline "3 days"]]]]]}]}))

(defn get-pending-for-invitee
  ([params] (get-pending-for-invitee (aurora/conn-pool :read) params))
  ([conn {:keys [email]}]
   (sql/select ::get-pending-for-invitee
               conn
               (uhsql/formatp pending-for-invitee-q {:email email}))))

(defn make-accept-by-id-q [app-or-org]
  (uhsql/preformat {:update (tbl app-or-org)
                    :set {:status [:inline "accepted"]}
                    :where [:and
                            [:= :id :?id]
                            [:= :status [:inline "pending"]]
                            [:>= :sent_at [:- :%now [:interval [:inline "3 days"]]]]]}))

(def accept-by-id-qs {:app (make-accept-by-id-q :app)
                      :org (make-accept-by-id-q :org)})

(defn accept-by-id!
  ([params] (accept-by-id! (aurora/conn-pool :write) params))
  ([conn {:keys [id]}]
   (let [{:keys [type]} (get-by-id! conn {:id id})]
     (-> (sql/execute-one! ::accept-by-id!
                           conn
                           (uhsql/formatp (accept-by-id-qs type) {:id id}))
         (ex/assert-record! :member-invite {:args [{:id id}]})
         (assoc :type type)))))

(defn make-reject-by-id-q [app-or-org]
  (uhsql/preformat {:update (tbl app-or-org)
                    :set {:status [:inline "revoked"]}
                    :where [:and
                            [:= :id :?id]
                            [:= :status [:inline "pending"]]]}))

(def reject-by-id-qs {:app (make-reject-by-id-q :app)
                      :org (make-reject-by-id-q :org)})

(defn reject-by-id
  ([params] (reject-by-id (aurora/conn-pool :write) params))
  ([conn {:keys [id]}]
   (let [{:keys [type]} (get-by-id! conn {:id id})]
     (sql/execute-one! ::reject-by-id
                       conn
                       (uhsql/formatp (reject-by-id-qs type) {:id id})))))

(defn make-reject-by-id-and-foreign-key-q [app-or-org]
  (uhsql/preformat {:update (tbl app-or-org)
                    :set {:status [:inline "revoked"]}
                    :where [:and
                            [:= :id :?id]
                            [:= (fk app-or-org) :?foreign-key]
                            [:= :status [:inline "pending"]]]}))

(def reject-by-id-and-foreign-key-qs
  {:app (make-reject-by-id-and-foreign-key-q :app)
   :org (make-reject-by-id-and-foreign-key-q :org)})

(defn reject-by-id-and-foreign-key
  ([params] (reject-by-id-and-foreign-key (aurora/conn-pool :write) params))
  ([conn {:keys [id type foreign-key]}]
   (sql/execute-one! ::reject-by-id-and-foreign-key
                     conn
                     (uhsql/formatp (reject-by-id-qs type) {:id id
                                                            :foreign-key foreign-key}))))

(defn make-delete-by-id-q [app-or-org]
  (uhsql/preformat {:delete-from (tbl app-or-org)
                    :where [:= :id :?id]}))

(def delete-by-id-qs {:app (make-delete-by-id-q :app)
                      :org (make-delete-by-id-q :org)})

(defn delete-by-id!
  ([params] (delete-by-id! (aurora/conn-pool :write) params))
  ([conn {:keys [id]}]
   (let [{:keys [type]} (get-by-id! conn {:id id})]
     (sql/execute-one! ::delete-by-id
                       conn
                       (uhsql/formatp (delete-by-id-qs type) {:id id})))))

(defn make-delete-by-id-and-foreign-key-q [app-or-org]
  (uhsql/preformat {:delete-from (tbl app-or-org)
                    :where [:= :id :?id]}))

(def delete-by-id-and-foreign-key-qs
  {:app (make-delete-by-id-and-foreign-key-q :app)
   :org (make-delete-by-id-and-foreign-key-q :org)})

(defn delete-by-id-and-foreign-key!
  ([params] (delete-by-id-and-foreign-key! (aurora/conn-pool :write) params))
  ([conn {:keys [type foreign-key id]}]
   (sql/execute-one! ::delete-by-id-and-foreign-key
                     conn
                     (uhsql/formatp (delete-by-id-and-foreign-key-qs type) {:id id
                                                                            :foreign-key foreign-key}))))

(defn make-reject-by-email-and-role-q [app-or-org]
  (uhsql/preformat
   {:update (tbl app-or-org)
    :set {:status [:inline "revoked"]}
    :where [:and
            [:= :inviter_id :?inviter-id]
            [:= (fk app-or-org) :?foreign-key]
            [:= :invitee-email :?invitee-email]
            [:= :invitee-role :?email]
            [:= :status [:inline "pending"]]]}))

(def reject-by-email-and-role-qs
  {:app (make-reject-by-email-and-role-q :app)
   :org (make-reject-by-email-and-role-q :org)})

(defn reject-by-email-and-role
  ([params] (reject-by-email-and-role (aurora/conn-pool :write) params))
  ([conn {:keys [inviter-id type foreign-key invitee-email role]}]
   (sql/execute! ::reject-by-email-and-role
                 conn
                 (uhsql/formatp (reject-by-email-and-role-qs type)
                                {:inviter-id inviter-id
                                 :foreign-key foreign-key
                                 :invitee-email invitee-email
                                 :invitee-role role}))))
