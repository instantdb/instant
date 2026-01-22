(ns instant.util.roles
  (:require
   [instant.model.app :as app-model]
   [instant.model.app-members :as instant-app-members]
   [instant.model.instant-subscription :as instant-subscription-model]
   [instant.model.org-members :as instant-org-members]
   [instant.util.coll :as ucoll]
   [instant.util.exception :as ex]))

(def member-role-hierarchy [:collaborator :admin :owner])
(def member-roles (set member-role-hierarchy))

(defn max-role [a b]
  (if (> (or (ucoll/index-of a member-role-hierarchy) -1)
         (or (ucoll/index-of b member-role-hierarchy) -1))
    a
    b))

(defn assert-valid-member-role! [role]
  (ex/assert-valid! :role
                    role
                    (when-not (contains? member-roles (keyword role))
                      ["Invalid role"])))

(comment
  (assert-valid-member-role! :collaborator)
  (assert-valid-member-role! :admin)
  (assert-valid-member-role! :owner)
  (assert-valid-member-role! nil)
  (assert-valid-member-role! 1)
  (max-role :collaborator :admin)
  (max-role :collaborator :collaborator)
  (max-role :owner :collaborator))

(defn has-at-least-role? [least-privilege-role user-role]
  (assert (contains? member-roles least-privilege-role)
          (str "Expected valid least-privilege-role, got " least-privilege-role))
  (and user-role
       (contains? member-roles user-role)
       (<= (ucoll/index-of least-privilege-role member-role-hierarchy)
           (ucoll/index-of user-role member-role-hierarchy))))

(defn assert-least-privilege! [least-privilege-role user-role]
  (assert (contains? member-roles least-privilege-role)
          (str "Expected valid least-privilege-role, got " least-privilege-role))
  (ex/assert-valid!
    :user-role
    user-role
    (or (when-not user-role
          [{:message (format "User is missing role %s."
                             (name least-privilege-role))}])
        (when-not (contains? member-roles user-role)
          [{:message "This is not a valid role"
            :expected member-roles}])))
  (ex/assert-permitted! :allowed-member-role? user-role
                        (has-at-least-role? least-privilege-role user-role)))

(defn get-app-member-role [app user-id]
  (let [member (instant-app-members/get-by-app-and-user {:app-id (:id app)
                                                         :user-id user-id})
        role (keyword (:member_role member))]
    (when role
      {:role role
       :member member})))

(defn get-org-member-role [app user-id]
  (when-let [org-id (:org_id app)]
    (let [member (instant-org-members/get-by-org-and-user {:org-id org-id
                                                           :user-id user-id})
          role (keyword (:role member))]
      (when role
        {:role role
         :member member}))))

(defn get-app-with-role! [{:keys [user
                                  app-id
                                  role]}]
  (let [{app-creator-id :creator_id :as app} (app-model/get-by-id! {:id app-id})
        app-subscription (instant-subscription-model/get-by-app-id {:app-id app-id})
        org-subscription (when-let [org-id (:org_id app)]
                           (instant-subscription-model/get-by-org-id {:org-id org-id}))
        app-member-role (if (= (:id user) app-creator-id)
                          {:role :owner}
                          (get-app-member-role app (:id user)))
        good-app-role? (has-at-least-role? role (:role app-member-role))
        org-member-role (get-org-member-role app (:id user))
        good-org-role? (has-at-least-role? role (:role org-member-role))]
    (cond (or (and app-member-role
                   good-app-role?
                   (or (= :owner (:role app-member-role))
                       (some-> app-member-role
                               :member
                               instant-app-members/created-before-free-teams-cutoff?)
                       (instant-subscription-model/plan-supports-members? app-subscription)
                       (instant-subscription-model/plan-supports-members? org-subscription)))

              (and org-member-role
                   good-org-role?
                   (or (= :owner org-member-role)
                       (some-> org-member-role
                               :member
                               instant-org-members/created-before-free-teams-cutoff?)
                       (instant-subscription-model/plan-supports-members? org-subscription))))
          ;; This is the only success case. The user has access through
          ;; either the app or the org.
          {:app app :user user :role (max-role (:role app-member-role)
                                               (:role org-member-role))}

          ;; Has no role
          (and (not app-member-role)
               (not org-member-role))
          (ex/throw-validation-err! :user-role nil [{:message (format "User is missing role %s."
                                                                      (name role))}])

          ;; Has a role, but not one good enough to get access
          (and (not good-app-role?)
               (not good-org-role?))
          (ex/assert-permitted! :allowed-member-role?
                                (or (:role app-member-role)
                                    (:role org-member-role))
                                false)

          ;; Has a role, but plan doesn't support members
          :else
          (ex/throw-insufficient-plan! {:capability "multiple members"}))))
