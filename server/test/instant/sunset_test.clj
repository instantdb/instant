(ns instant.sunset-test
  (:require
   [clojure.string :as string]
   [clojure.test :refer [deftest is testing]]
   [instant.config :as config]
   [instant.dash.routes :as dash-routes]
   [instant.email-router :as email-router]
   [instant.fixtures :refer [random-email with-empty-app with-user]]
   [instant.flags :as flags]
   [instant.model.app :as app-model]
   [instant.model.app-members :as app-members]
   [instant.model.instant-subscription :as instant-subscription-model]
   [instant.stripe :as stripe]
   [instant.stripe-webhook :as stripe-webhook]
   [instant.sunset :as sunset]
   [instant.util.exception :as ex]
   [instant.util.http :as http-util]
   [instant.util.roles :as roles]
   [instant.util.test :refer [instant-ex-data]]))

(defmacro with-stage [stage & body]
  `(binding [flags/*flag-overrides* {:sunset-stage ~stage}]
     ~@body))

(deftest apply-sunset-stage-overlays-own-status
  (let [app-id (random-uuid)]
    (testing "no stage leaves the app's own status alone"
      (with-stage nil
        (is (= :active (app-model/apply-sunset-stage app-id :active)))
        (is (= :read-only (app-model/apply-sunset-stage app-id :read-only)))))
    (testing "signups-closed also leaves the app's own status alone"
      (with-stage "signups-closed"
        (is (= :active (app-model/apply-sunset-stage app-id :active)))
        (is (= :read-only (app-model/apply-sunset-stage app-id :read-only)))))
    (testing "the more restrictive of own status and stage wins"
      (with-stage "read-only"
        (is (= :read-only (app-model/apply-sunset-stage app-id :active)))
        (is (= :disabled (app-model/apply-sunset-stage app-id :disabled))))
      (with-stage "disabled"
        (is (= :disabled (app-model/apply-sunset-stage app-id :active)))
        (is (= :disabled (app-model/apply-sunset-stage app-id :read-only)))))
    (testing "the config app is always exempt"
      (with-stage "disabled"
        (is (= :active
               (app-model/apply-sunset-stage config/instant-config-app-id
                                             :active)))))))

(deftest sunset-stage-gates-reads-and-writes
  (with-empty-app
    (fn [{app-id :id}]
      (testing "without a stage the app is active"
        (is (= :active (app-model/get-status app-id)))
        (is (nil? (app-model/assert-write-allowed! app-id))))
      (testing "signups-closed doesn't gate reads or writes"
        (with-stage "signups-closed"
          (is (= :active (app-model/get-status app-id)))
          (is (nil? (app-model/assert-write-allowed! app-id)))
          (is (nil? (app-model/assert-read-allowed! app-id)))))
      (testing "read-only stage blocks writes but not reads"
        (with-stage "read-only"
          (is (= :read-only (app-model/get-status app-id)))
          (is (= :active (app-model/get-own-status app-id)))
          (is (= ::ex/app-read-only
                 (::ex/type (instant-ex-data
                             (app-model/assert-write-allowed! app-id)))))
          (is (nil? (app-model/assert-read-allowed! app-id)))))
      (testing "disabled stage blocks reads too"
        (with-stage "disabled"
          (is (= ::ex/app-disabled
                 (::ex/type (instant-ex-data
                             (app-model/assert-read-allowed! app-id))))))))))

(deftest sunset-stage-blocks-app-model-creation
  (testing "signups-closed still allows underlying app creation for the Platform SDK"
    (with-stage "signups-closed"
      (with-empty-app
        (fn [{app-id :id}]
          (is (uuid? app-id))))))
  (testing "read-only blocks app creation"
    (with-stage "read-only"
      ;; create! throws before touching the database, so the fake
      ;; creator-id never hits a foreign key
      (is (= ::ex/app-creation-disabled
             (::ex/type (instant-ex-data
                         (app-model/create! {:id (random-uuid)
                                             :title "sunset-blocked"
                                             :creator-id (random-uuid)
                                             :admin-token (random-uuid)}))))))))

(deftest sunset-stage-blocks-dash-app-creation
  (let [email "allowed@example.com"
        user-id (random-uuid)
        req {:body {:id (random-uuid)
                    :title "sunset-dash-app"
                    :admin_token (random-uuid)}}]
    (with-redefs [dash-routes/req->auth-user-accepting-superadmin-token!
                  (constantly {:id user-id :email email})
                  app-model/create! identity]
      (testing "the dashboard route allows app creation before the sunset"
        (with-stage nil
          (is (= (:id (:body req))
                 (-> (dash-routes/apps-post req) :body :app :id)))))
      (testing "signups-closed blocks the dashboard route"
        (with-stage "signups-closed"
          (is (= ::ex/app-creation-disabled
                 (::ex/type (instant-ex-data
                             (dash-routes/apps-post req)))))))
      (testing "an email flag can bypass the dashboard restriction"
        (binding [flags/*flag-overrides*
                  {:sunset-stage "signups-closed"
                   :sunset-app-creation-allowed-emails
                   [(string/upper-case email)]}]
          (is (= (:id (:body req))
                 (-> (dash-routes/apps-post req) :body :app :id)))))
      (testing "the computed permission matches the route behavior"
        (with-stage nil
          (is (true? (flags/dash-app-creation-allowed? email))))
        (with-stage "signups-closed"
          (is (false? (flags/dash-app-creation-allowed? email))))
        (binding [flags/*flag-overrides*
                  {:sunset-stage "signups-closed"
                   :sunset-app-creation-allowed-emails [email]}]
          (is (true? (flags/dash-app-creation-allowed? email))))))))

(deftest sunset-app-creation-allowlist-does-not-bypass-full-sunset
  (doseq [stage ["read-only" "disabled"]]
    (binding [flags/*flag-overrides*
              {:sunset-stage stage
               :sunset-app-creation-allowed-emails ["allowed@example.com"]}]
      (is (false? (flags/dash-app-creation-allowed? "allowed@example.com"))
          (str "stage: " stage)))))

(deftest sunset-stage-blocks-dash-app-claiming
  (let [email "blocked@example.com"
        req {:params {:app_id (random-uuid)}
             :body {:token (random-uuid)}}]
    (with-redefs [http-util/req->auth-user!
                  (constantly {:id (random-uuid) :email email})]
      (with-stage "signups-closed"
        (is (= ::ex/app-creation-disabled
               (::ex/type (instant-ex-data
                           (dash-routes/claim-app-post req)))))))))

(deftest broadcast-skips-stages-that-do-not-touch-apps
  (testing "hops between none and signups-closed don't wake sessions"
    (is (false? (sunset/stage-change-affects-apps? nil "signups-closed")))
    (is (false? (sunset/stage-change-affects-apps? "signups-closed" nil)))
    (is (false? (sunset/stage-change-affects-apps? nil "bogus-value"))))
  (testing "any transition touching read-only or disabled broadcasts"
    (is (true? (sunset/stage-change-affects-apps? "signups-closed" "read-only")))
    (is (true? (sunset/stage-change-affects-apps? "read-only" "disabled")))
    (is (true? (sunset/stage-change-affects-apps? "read-only" "signups-closed")))
    (is (true? (sunset/stage-change-affects-apps? "disabled" nil)))))

(deftest signups-close-from-signups-closed-on
  (with-stage nil
    (is (false? (flags/signups-closed?))))
  (doseq [stage ["signups-closed" "read-only" "disabled"]]
    (with-stage stage
      (is (true? (flags/signups-closed?)) (str "stage: " stage)))))

(deftest signups-closed-stage-closes-magic-code-signups
  (with-stage "signups-closed"
    (testing "emails without an account are rejected"
      (is (= ::ex/signups-closed
             (::ex/type (instant-ex-data
                         (dash-routes/send-magic-code-post
                          {:body {:email (random-email)}}))))))
    (testing "existing users still get codes"
      (with-user
        (fn [{email :email}]
          (let [sent (atom nil)]
            (with-redefs [email-router/send-structured! (fn [m] (reset! sent m))]
              (dash-routes/send-magic-code-post {:body {:email email}})
              (is (some? @sent)))))))))

(deftest billing-closes-from-signups-closed-on
  (with-stage nil
    (is (false? (flags/billing-closed?)))
    (is (false? (flags/paid-features-free?))))
  (doseq [stage ["signups-closed" "read-only" "disabled"]]
    (with-stage stage
      (is (true? (flags/billing-closed?)) (str "stage: " stage))
      (is (true? (flags/paid-features-free?)) (str "stage: " stage)))))

(deftest billing-closed-stage-gates-checkout
  (with-stage "signups-closed"
    (is (= ::ex/billing-closed
           (::ex/type (instant-ex-data
                       (dash-routes/checkout-session-post {})))))
    (is (= ::ex/billing-closed
           (::ex/type (instant-ex-data
                       (dash-routes/org-checkout-session-post {})))))))

(deftest paid-features-free-makes-every-plan-support-members
  (with-stage nil
    (is (false? (instant-subscription-model/plan-supports-members? nil)))
    (is (true? (instant-subscription-model/plan-supports-members?
                {:subscription_type_id 2}))))
  (with-stage "signups-closed"
    (is (true? (instant-subscription-model/plan-supports-members? nil)))
    (is (true? (instant-subscription-model/plan-supports-members?
                {:subscription_type_id 1})))))

(deftest paid-features-free-gives-members-team-access
  (with-user
    (fn [owner]
      (with-user
        (fn [member-user]
          (with-empty-app
            (:id owner)
            (fn [app]
              (app-members/create! {:app-id (:id app)
                                    :user-id (:id member-user)
                                    :role "collaborator"})
              (testing "a member on a free app is blocked without the flag"
                (with-stage nil
                  (is (= ::ex/permission-denied
                         (::ex/type (instant-ex-data
                                     (roles/get-app-with-role!
                                      {:user member-user
                                       :app-id (:id app)
                                       :role :collaborator})))))))
              (testing "announcement makes every plan support members"
                (with-stage "signups-closed"
                  (is (= :collaborator
                         (:role (roles/get-app-with-role!
                                 {:user member-user
                                  :app-id (:id app)
                                  :role :collaborator})))))))))))))

(deftest paid-features-free-lists-member-apps
  (with-user
    (fn [owner]
      (with-user
        (fn [member-user]
          (with-empty-app
            (:id owner)
            (fn [app]
              (app-members/create! {:app-id (:id app)
                                    :user-id (:id member-user)
                                    :role "collaborator"})
              (let [visible-app-ids
                    (fn []
                      (set (map :id (app-model/get-all-for-user
                                     {:user-id (:id member-user)}))))]
                (testing "a member of a free app doesn't see it without the flag"
                  (with-stage nil
                    (is (not (contains? (visible-app-ids) (:id app))))))
                (testing "announcement makes member apps visible"
                  (with-stage "signups-closed"
                    (is (contains? (visible-app-ids) (:id app)))))))))))))

(deftest sunset-cancellations-ping-discord-without-email
  (let [discord (atom [])
        churn-pings (atom 0)]
    (with-redefs [stripe-webhook/send-discord! (fn [msg] (swap! discord conj msg))
                  stripe-webhook/ping-js-on-churned-customer (fn [_] (swap! churn-pings inc))]
      (stripe-webhook/handle-stripe-webhook-event
       {:id (str "evt_" (random-uuid))
        :type "customer.subscription.deleted"
        :data {:object {:customer "cus_fake"
                        :subscription "sub_fake"
                        :metadata {:user-id (str (random-uuid))
                                   :app-id (str (random-uuid))
                                   :cancel-reason "sunset"}}}})
      (is (zero? @churn-pings))
      (is (= 1 (count @discord)))
      (is (string/includes? (first @discord) "Sunset")))))

(deftest cancel-all-subscriptions-refuses-outside-prod
  (with-redefs [stripe/subscriptions
                (fn [] (throw (Exception. "should not list subscriptions")))
                stripe/schedule-cancel-at-period-end!
                (fn [_] (throw (Exception. "should not touch subscriptions")))]
    (is (= ::ex/validation-failed
           (::ex/type (instant-ex-data
                       (sunset/cancel-all-subscriptions!)))))))

(deftest cancel-all-subscriptions-schedules-only-unscheduled
  (let [calls (atom [])]
    (with-redefs [config/prod? (constantly true)
                  stripe/subscriptions
                  (fn [] [{:subscription-id "sub_active" :cancel-at-period-end false}
                          {:subscription-id "sub_scheduled" :cancel-at-period-end true}])
                  stripe/schedule-cancel-at-period-end!
                  (fn [opts] (swap! calls conj opts))]
      (let [result (sunset/cancel-all-subscriptions!)]
        (is (= {:scheduling-count 1 :already-scheduled-count 1} result))
        ;; The updates run in a background future; wait for them inside
        ;; with-redefs so the real Stripe fns can't leak in.
        (loop [attempts 0]
          (when (and (empty? @calls) (< attempts 100))
            (Thread/sleep 10)
            (recur (inc attempts))))
        (is (= [{:subscription-id "sub_active"
                 :metadata {"cancel-reason" "sunset"}}]
               @calls))))))
