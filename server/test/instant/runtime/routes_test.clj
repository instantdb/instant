(ns instant.runtime.routes-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [instant.core :as core]
   [instant.db.datalog :as d]
   [instant.db.model.attr :as attr-model]
   [instant.db.model.triple :as triples]
   [instant.db.permissioned-transaction :as permissioned-tx]
   [instant.fixtures :refer [with-empty-app]]
   [instant.flags :as flags]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.model.app-oauth-service-provider :as provider-model]
   [instant.model.app-user :as app-user-model]
   [instant.model.rule :as rule-model]
   [instant.postmark :as postmark]
   [instant.reactive.ephemeral :as eph]
   [instant.reactive.store :as rs]
   [instant.runtime.routes :as route]
   [instant.system-catalog :as system-catalog]
   [instant.util.coll :as coll]
   [instant.util.crypt :as crypt-util]
   [instant.util.json :refer [->json <-json]]
   [instant.util.test :as test-util]
   [instant.util.tracer :as tracer])
  (:import
   (clojure.lang ExceptionInfo)
   (java.io ByteArrayInputStream)))

(defn request [opts]
  (with-redefs [tracer/*silence-exceptions?* (atom true)]
    (let [req (merge-with merge
                          {:headers {"content-type" "application/json"}
                           :request-method (:method opts)
                           :uri (:url opts)}
                          (-> opts
                              (coll/update-when :body (fn [body]
                                                        (ByteArrayInputStream. (.getBytes ^String (->json body) "UTF-8"))))))
          resp (-> ((core/handler) req)
                   (update :body (fn [body]
                                   (<-json body true))))]
      (if (not= 200 (:status resp))
        (throw (ex-info (str "status " (:status resp)) resp))
        resp))))

(defn send-code-runtime [app body]
  (let [letter (atom nil)]
    (with-redefs [postmark/send-structured! #(reset! letter %)]
      (request {:method :post
                :url    "/runtime/auth/send_magic_code"
                :body   (assoc body
                               :app-id (:id app))}))
    (re-find #"\d+" (-> @letter :subject))))

(defn post-code-admin [app body]
  (-> (request {:method :post
                :url     "/admin/magic_code"
                :headers {"app-id"        (:id app)
                          "authorization" (str "Bearer " (:admin-token app))}
                :body    body})
      :body
      :code))

(defn send-code-admin [app body]
  (let [letter (atom nil)]
    (with-redefs [postmark/send-structured! #(reset! letter %)]
      (let [resp (request {:method  :post
                           :url     "/admin/send_magic_code"
                           :headers {"app-id"        (:id app)
                                     "authorization" (str "Bearer " (:admin-token app))}
                           :body    body})
            code-email (re-find #"\d+" (-> @letter :subject))
            code-resp  (-> resp :body :code)]
        (is (= code-email code-resp))
        code-email))))

(defn verify-code-runtime [app body]
  (-> (request {:method :post
                :url    "/runtime/auth/verify_magic_code"
                :body   (assoc body
                               :app-id (:id app))})
      :body
      :user))

(defn verify-code-admin [app body]
  (-> (request {:method :post
                :url     "/admin/verify_magic_code"
                :headers {"app-id"        (:id app)
                          "authorization" (str "Bearer " (:admin-token app))}
                :body    body})
      :body
      :user))

(defn sign-in-guest-runtime [app]
  (-> (request {:method :post
                :url    "/runtime/auth/sign_in_guest"
                :body   {:app-id (:id app)}})
      :body
      :user))

(defn sign-in-guest-admin [app]
  (-> (request {:method :post
                :url    "/admin/sign_in_guest"
                :headers {"app-id"        (:id app)
                          "authorization" (str "Bearer " (:admin-token app))}})
      :body
      :user))

(deftest magic-codes-test
  (test-util/test-matrix
   [[send-code verify-code]
    [[send-code-runtime verify-code-runtime]
     [post-code-admin   verify-code-admin]
     [send-code-admin   verify-code-admin]]]
   (with-empty-app
     (fn [{app-id :id :as app}]
       (testing "auth for new user"
         (let [code  (send-code app {:email "a@b.c"})
               code2 (send-code app {:email "a@b.c"})]

           (testing "can generate two codes"
             (is (not= code code2)))

           (testing "can't use different code"
             (is (thrown-with-msg? ExceptionInfo #"status 400" (verify-code app {:email "a@b.c" :code "000000"}))))

           (testing "can't use different email"
             (is (thrown-with-msg? ExceptionInfo #"status 400" (verify-code app {:email "wrong-email" :code code}))))

           (testing "happy path"
             (let [user (verify-code app {:email "a@b.c" :code code})]
               (is (= (str app-id) (:app_id user)))
               (is (= "a@b.c" (:email user)))
               (is (some? (:refresh_token user)))))

           (testing "can't reuse code"
             (is (thrown-with-msg? ExceptionInfo #"status 400" (verify-code app {:email "a@b.c" :code code}))))

           (testing "can use second unused code"
             (let [user (verify-code app {:email "a@b.c" :code code2})]
               (is (= (str app-id) (:app_id user)))
               (is (= "a@b.c" (:email user)))
               (is (some? (:refresh_token user)))))

           (testing "auth for existing user"
             (let [code3 (send-code app {:email "a@b.c"})
                   _     (is (not= code code3))
                   _     (is (not= code2 code3))
                   user  (verify-code app {:email "a@b.c" :code code3})]
               (is (= (str app-id) (:app_id user)))
               (is (= "a@b.c" (:email user)))
               (is (some? (:refresh_token user)))))))))))

(defn update-created-at [app-id code created-at]
  (sql/execute!
   (aurora/conn-pool :write)
   (sql/format
    "UPDATE
       triples
     SET
       created_at = ?created-at
     WHERE
       app_id = ?app-id
     AND entity_id = (
       SELECT
         entity_id
       FROM
         triples
       WHERE
         app_id = ?app-id
         AND value = ?code-hash::jsonb
     )"
    {"?created-at" created-at
     "?app-id"     app-id
     "?code-hash"  (-> code
                       crypt-util/str->sha256
                       crypt-util/bytes->hex-string
                       ->json)})))

(deftest magic-codes-expire-test
  (test-util/test-matrix
   [[send-code verify-code]
    [[send-code-runtime verify-code-runtime]
     [post-code-admin   verify-code-admin]
     [send-code-admin   verify-code-admin]]]
   (with-empty-app
     (fn [{app-id :id :as app}]
       (let [code (send-code app {:email "a@b.c"})]
         (update-created-at app-id code (- (System/currentTimeMillis) (* 25 60 60 1000)))
         (is (thrown-with-msg? ExceptionInfo #"status 400" (verify-code app {:email "a@b.c" :code code}))))

       (let [code (send-code app {:email "a@b.c"})]
         (update-created-at app-id code (- (System/currentTimeMillis) (* 23 60 60 1000)))
         (is (= "a@b.c" (:email (verify-code app {:email "a@b.c" :code code})))))))))

(deftest magic-codes-rate-limit-test
  (with-empty-app
    (fn [app]
      (binding [flags/*flag-overrides* {:magic-code-rate-limit-per-hour 1}]
        (let [hz (delay (eph/init-hz :test
                                     (rs/init)
                                     (let [id (+ 100000 (rand-int 900000))]
                                       {:instance-name (str "test-instance-" id)
                                        :cluster-name  (str "test-cluster-" id)})))]
          (try
            (with-redefs [postmark/send-structured! (constantly nil)
                          eph/hz hz]

              (testing "first request succeeds"
                (is (= 200 (:status (request {:method :post
                                              :url "/runtime/auth/send_magic_code"
                                              :body {:app-id (:id app)
                                                     :email "a@b.c"}})))))
              (testing "second request is rate limited"
                (is (thrown-with-msg? ExceptionInfo #"status 429"
                                      (request {:method :post
                                                :url "/runtime/auth/send_magic_code"
                                                :body {:app-id (:id app)
                                                       :email "a@b.c"}}))))
              (testing "different email is not rate limited"
                (is (= 200 (:status (request {:method :post
                                              :url "/runtime/auth/send_magic_code"
                                              :body {:app-id (:id app)
                                                     :email "different@b.c"}}))))))
            (finally
              (eph/shutdown-hz hz))))))))

(deftest guest-test
  (test-util/test-matrix
   [sign-in-guest [sign-in-guest-runtime
                   sign-in-guest-admin]
    send-code     [send-code-runtime]
    verify-code   [verify-code-runtime
                   verify-code-admin]]
   (with-empty-app
     (fn [{app-id :id :as app}]
       (let [guest  (sign-in-guest app)
             _      (is (= "guest" (:type guest)))
             _      (is (:isGuest guest))
             _      (is (= nil (:email guest)))
             _      (is (some? (:refresh_token guest)))

             ;; token is valid, can be used for auth
             guest-verified (-> (request {:method :post
                                          :url    "/runtime/auth/verify_refresh_token"
                                          :body   {:app-id app-id
                                                   :refresh-token (:refresh_token guest)}})
                                :body
                                :user)

             _      (is (= guest guest-verified))

             ;; guest converts to user
             code   (send-code app {:email "1@b.c"})
             user   (verify-code app {:email         "1@b.c"
                                      :code          code
                                      :refresh-token (:refresh_token guest)})
             _      (is (not (:isGuest user)))
             _      (is (= (:id guest) (:id user)))
             _      (is (= "user" (:type user)))
             _      (is (= "1@b.c" (:email user)))

             ;; can't convert guest to existing user
             guest2 (sign-in-guest app)
             _ (is (:isGuest guest2))
             code2  (send-code app {:email "1@b.c"})
             user2  (verify-code app {:email         "1@b.c"
                                      :code          code2
                                      :refresh-token (:refresh_token guest2)})
             _ (is (not (:isGuest user2)))
             _ (is (not= (:id guest2) (:id user2)))
             _ (testing "we link the guest user to the real user"
                 (is (= (parse-uuid (:id user2))
                        (-> (triples/fetch (aurora/conn-pool :read)
                                           app-id
                                           [[:= :entity_id (parse-uuid (:id guest2))]
                                            [:= :attr_id (:id system-catalog/$users-linked-primary-user)]])
                            first
                            :triple
                            last))))

             code3 (send-code app {:email "1@b.c"})
             user3 (verify-code app {:email "1@b.c"
                                     :code code3
                                     :refresh-token (:refresh_token user2)})
             _ (testing "we ignore the refresh token if it's not a guest account"
                 (is (empty? (triples/fetch (aurora/conn-pool :read)
                                            app-id
                                            [[:= :entity_id (parse-uuid (:id user3))]
                                             [:= :attr_id (:id system-catalog/$users-linked-primary-user)]]))))])))))

(deftest upsert-oauth-link!
  (with-empty-app
    (fn [app]
      (let [provider (provider-model/create! {:app-id (:id app)
                                              :provider-name "clerk"})]

        (let [sub "sub"]
          (testing "verified email creates a user with same email"
            (let [link (route/upsert-oauth-link! {:email "test@example.com"
                                                  :sub sub
                                                  :app-id (:id app)
                                                  :provider-id (:id provider)})
                  user (app-user-model/get-by-id {:id (:user_id link)
                                                  :app-id (:id app)})]
              (is (= (:email user) "test@example.com"))
              (is (= (:sub link) sub))))

          (testing "sign in with same sub produces same user"
            (let [link (route/upsert-oauth-link! {:email "test@example.com"
                                                  :sub sub
                                                  :app-id (:id app)
                                                  :provider-id (:id provider)})
                  user (app-user-model/get-by-id {:id (:user_id link)
                                                  :app-id (:id app)})]
              (is (= (:email user) "test@example.com"))
              (is (= (:sub link) sub))))

          (testing "sign in with same sub produces same user even if email is not provided"
            (let [link (route/upsert-oauth-link! {:email nil
                                                  :sub sub
                                                  :app-id (:id app)
                                                  :provider-id (:id provider)})
                  user (app-user-model/get-by-id {:id (:user_id link)
                                                  :app-id (:id app)})]
              (is (= (:email user) "test@example.com"))
              (is (= (:sub link) sub)))))

        (let [sub "sub2"]
          (testing "sign in without email creates user"
            (let [link (route/upsert-oauth-link! {:email nil
                                                  :sub sub
                                                  :app-id (:id app)
                                                  :provider-id (:id provider)})
                  user (app-user-model/get-by-id {:id (:user_id link)
                                                  :app-id (:id app)})]
              (is (= (:email user) nil))
              (is (= "user" (:type user)))
              (is (= (:sub link) sub))))

          (testing "sign in with email later updates email"
            (let [link (route/upsert-oauth-link! {:email "test2@example.com"
                                                  :sub sub
                                                  :app-id (:id app)
                                                  :provider-id (:id provider)})
                  user (app-user-model/get-by-id {:id (:user_id link)
                                                  :app-id (:id app)})]
              (is (= (:email user) "test2@example.com"))
              (is (= "user" (:type user)))
              (is (= (:sub link) sub)))))))))

(deftest upsert-oauth-link-disambiguates-with-email
  (with-empty-app
    (fn [app]
      ;; Apple OAuth lets you provide "relay" emails: 
      ;; these are anonymous emails that forward to the user's real email. 

      ;; This opens up a potential problem. 

      ;; Consider the following scenario: 
      ;; (1) User signs in with magic code: stopa@instantdb.com 
      ;; (2) User signs in with with Apple, private relay on: foo@privaterelay.appleid.com  

      ;; At this point we'll have _2_ separate users. 

      ;; Now 
      ;; (3) The user signs in with Apple, private relay off: stopa@instantdb.com. 

      ;; Which user should we link this 3rd sign up too? It matches _both_ the 
      ;; existing email user, and the existing Apple Oauth link. 

      ;; Currently, we choose the existing email user. 
      ;; This means that the user with the private relay email will get stranded. 
      ;; However, in the worst case scenario, they can be recovered manually.
      (let [provider (provider-model/create! {:app-id (:id app)
                                              :provider-name "apple"})
            email "stopa@instantdb.com"
            sub "apple-sub"

            email-user (app-user-model/create! {:app-id (:id app)
                                                :email email
                                                :type "user"})

            anon-link (route/upsert-oauth-link! {:email "abcd1234@privaterelay.appleid.com"
                                                 :sub sub
                                                 :app-id (:id app)
                                                 :provider-id (:id provider)})

            revealed-link (route/upsert-oauth-link! {:email email
                                                     :sub sub
                                                     :app-id (:id app)
                                                     :provider-id (:id provider)})]
        (is email-user)
        (is anon-link)
        (is (not= (:id email-user) (:user_id anon-link)))
        (is (= (:id email-user) (:user_id revealed-link)))))))

;; -----
;; Extra fields on signup

(defn verify-code-body-runtime [app body]
  (-> (request {:method :post
                :url    "/runtime/auth/verify_magic_code"
                :body   (assoc body :app-id (:id app))})
      :body))

(defn verify-code-body-admin [app body]
  (-> (request {:method :post
                :url     "/admin/verify_magic_code"
                :headers {"app-id"        (:id app)
                          "authorization" (str "Bearer " (:admin-token app))}
                :body    body})
      :body))

(deftest extra-fields-magic-code-test
  (test-util/test-matrix
   [[send-code verify-body]
    [[send-code-runtime verify-code-body-runtime]
     [post-code-admin   verify-code-body-admin]]]
   (with-empty-app
     (fn [{app-id :id :as app}]
       ;; Add custom attrs to $users
       (test-util/make-attrs app-id
                             [[:$users/username :unique? :index?]
                              [:$users/displayName]])
       (rule-model/put! {:app-id app-id
                         :code {"$users" {"allow" {"create" "true"}}}})

       (testing "new user with extra-fields"
         (let [code (send-code app {:email "new@test.com"})
               body (verify-body app {:email "new@test.com"
                                      :code code
                                      :extra-fields {"username" "cool_user"
                                                     "displayName" "Cool User"}})
               user (app-user-model/get-by-email {:app-id app-id
                                                  :email "new@test.com"})]
           (is (true? (:created body)))
           (is (= "new@test.com" (-> body :user :email)))
           (is (= "cool_user" (:username user)))
           (is (= "Cool User" (:displayName user)))))

       (testing "existing user ignores extra-fields"
         (let [code (send-code app {:email "new@test.com"})
               body (verify-body app {:email "new@test.com"
                                      :code code
                                      :extra-fields {"username" "different_name"
                                                     "displayName" "Different"}})
               user (app-user-model/get-by-email {:app-id app-id
                                                  :email "new@test.com"})]
           (is (false? (:created body)))
           (is (= "cool_user" (:username user)))
           (is (= "Cool User" (:displayName user)))))

       (testing "without extra-fields (backwards compat)"
         (let [code (send-code app {:email "compat@test.com"})
               body (verify-body app {:email "compat@test.com"
                                      :code code})]
           (is (true? (:created body)))
           (is (= "compat@test.com" (-> body :user :email)))))

       (testing "unknown keys rejected"
         (let [code (send-code app {:email "bad@test.com"})]
           (is (thrown-with-msg?
                ExceptionInfo #"status 400"
                (verify-body app {:email "bad@test.com"
                                  :code code
                                  :extra-fields {"nonexistent" "value"}})))))

       (testing "system fields rejected"
         (let [code (send-code app {:email "sys@test.com"})]
           (is (thrown-with-msg?
                ExceptionInfo #"status 400"
                (verify-body app {:email "sys@test.com"
                                  :code code
                                  :extra-fields {"email" "evil@test.com"}})))))

       ;; new@test.com was created in the "new user with extra-fields" test above
       (testing "returning user with invalid extra-fields still signs in"
         (let [code (send-code app {:email "new@test.com"})
               body (verify-body app {:email "new@test.com"
                                      :code code
                                      :extra-fields {"nonexistent" "value"}})]
           (is (false? (:created body)))
           (is (= "new@test.com" (-> body :user :email)))))))))

(deftest extra-fields-guest-upgrade-test
  (test-util/test-matrix
   [sign-in-guest [sign-in-guest-runtime
                   sign-in-guest-admin]
    send-code     [send-code-runtime]
    verify-body   [verify-code-body-runtime
                   verify-code-body-admin]]
   (with-empty-app
     (fn [{app-id :id :as app}]
       (test-util/make-attrs app-id
                             [[:$users/username]])
       (rule-model/put! {:app-id app-id
                         :code {"$users" {"allow" {"create" "true"}}}})

       (let [guest (sign-in-guest app)
             _     (is (= "guest" (:type guest)))
             code  (send-code app {:email "guest@test.com"})
             body  (verify-body app {:email "guest@test.com"
                                     :code code
                                     :refresh-token (:refresh_token guest)
                                     :extra-fields {"username" "upgraded_user"}})
             user  (app-user-model/get-by-email {:app-id app-id
                                                 :email "guest@test.com"})]
         (is (true? (:created body)))
         (is (= (:id guest) (-> body :user :id)))
         (is (= "upgraded_user" (:username user))))))))

(deftest extra-fields-oauth-test
  (with-empty-app
    (fn [{app-id :id}]
      (test-util/make-attrs app-id
                            [[:$users/username]
                             [:$users/displayName]])
      (rule-model/put! {:app-id app-id
                        :code {"$users" {"allow" {"create" "true"}}}})

      (let [provider (provider-model/create! {:app-id app-id
                                              :provider-name "clerk"})]

        (testing "new user with extra-fields via oauth"
          (let [result (route/upsert-oauth-link! {:email "oauth@test.com"
                                                  :sub "oauth-sub-1"
                                                  :app-id app-id
                                                  :provider-id (:id provider)
                                                  :extra-fields {"username" "oauth_user"
                                                                 "displayName" "OAuth User"}})
                user   (app-user-model/get-by-id {:id (:user_id result)
                                                  :app-id app-id})]
            (is (true? (:created result)))
            (is (= "oauth_user" (:username user)))
            (is (= "OAuth User" (:displayName user)))))

        (testing "existing oauth user ignores extra-fields"
          (let [result (route/upsert-oauth-link! {:email "oauth@test.com"
                                                  :sub "oauth-sub-1"
                                                  :app-id app-id
                                                  :provider-id (:id provider)
                                                  :extra-fields {"username" "different_name"}})
                user   (app-user-model/get-by-id {:id (:user_id result)
                                                  :app-id app-id})]
            (is (false? (:created result)))
            (is (= "oauth_user" (:username user)))))))))

(deftest extra-fields-admin-refresh-tokens-test
  (with-empty-app
    (fn [{app-id :id :as app}]
      (test-util/make-attrs app-id
                            [[:$users/username]])

      (testing "new user with extra-fields via admin refresh-tokens"
        (let [resp (request {:method :post
                             :url "/admin/refresh_tokens"
                             :headers {"app-id" app-id
                                       "authorization" (str "Bearer " (:admin-token app))}
                             :body {:email "admin@test.com"
                                    :extra-fields {"username" "admin_user"}}})
              body (:body resp)
              user (app-user-model/get-by-email {:app-id app-id
                                                 :email "admin@test.com"})]
          (is (true? (:created body)))
          (is (= "admin_user" (:username user)))))

      (testing "existing user ignores extra-fields"
        (let [resp (request {:method :post
                             :url "/admin/refresh_tokens"
                             :headers {"app-id" app-id
                                       "authorization" (str "Bearer " (:admin-token app))}
                             :body {:email "admin@test.com"
                                    :extra-fields {"username" "different"}}})
              body (:body resp)
              user (app-user-model/get-by-email {:app-id app-id
                                                 :email "admin@test.com"})]
          (is (false? (:created body)))
          (is (= "admin_user" (:username user))))))))

;; -----
;; $users create permissions

(deftest users-create-rule-validation-test
  (testing "can save a $users create rule (no validation errors)"
    (is (empty? (rule-model/validation-errors
                 {"$users" {"allow" {"create" "true"}}}))))

  (testing "can still not save a $users delete rule"
    (is (seq (rule-model/validation-errors
              {"$users" {"allow" {"delete" "true"}}})))))

(deftest users-create-rule-magic-code-test
  (test-util/test-matrix
   [[send-code verify-body]
    [[send-code-runtime verify-code-body-runtime]]]
   (with-empty-app
     (fn [{app-id :id :as app}]
       (test-util/make-attrs app-id
                             [[:$users/username]])

       (testing "create rule blocks signup"
         (rule-model/put! {:app-id app-id
                           :code {"$users" {"allow" {"create" "false"}}}})
         (let [code (send-code app {:email "blocked@test.com"})]
           (is (thrown-with-msg?
                ExceptionInfo #"status 400"
                (verify-body app {:email "blocked@test.com"
                                  :code code})))
           ;; Magic code should not be consumed on permission failure
           ;; so we can retry with the same code after fixing rules
           (rule-model/put! {:app-id app-id
                             :code {"$users" {"allow" {"create" "true"}}}})
           (let [body (verify-body app {:email "blocked@test.com"
                                        :code code})]
             (is (true? (:created body)))
             (is (= "blocked@test.com" (-> body :user :email))))))

       (testing "create rule can restrict by email domain"
         (rule-model/put! {:app-id app-id
                           :code {"$users" {"allow" {"create" "data.email.endsWith('@allowed.com')"}}}})
         (let [code (send-code app {:email "nope@blocked.com"})]
           (is (thrown-with-msg?
                ExceptionInfo #"status 400"
                (verify-body app {:email "nope@blocked.com"
                                  :code code}))))
         (let [code (send-code app {:email "yes@allowed.com"})
               body (verify-body app {:email "yes@allowed.com"
                                      :code code})]
           (is (true? (:created body)))))

       (testing "create rule can validate extra-fields values"
         (rule-model/put! {:app-id app-id
                           :code {"$users" {"allow" {"create" "data.username == null || data.username.size() >= 3"}}}})
         (let [code (send-code app {:email "nofield@test.com"})]
           (is (thrown-with-msg?
                ExceptionInfo #"status 400"
                (verify-body app {:email "nofield@test.com"
                                  :code code
                                  :extra-fields {"username" "ab"}}))))
         ;; Valid username should succeed
         (let [code (send-code app {:email "nofield@test.com"})
               body (verify-body app {:email "nofield@test.com"
                                      :code code
                                      :extra-fields {"username" "valid_user"}})]
           (is (true? (:created body)))))

       (testing "default (no create rule) allows signup"
         (rule-model/put! {:app-id app-id :code {}})
         (let [code (send-code app {:email "default@test.com"})
               body (verify-body app {:email "default@test.com"
                                      :code code})]
           (is (true? (:created body)))))

       (testing "extra-fields without create rule blocks signup"
         (let [code (send-code app {:email "norule@test.com"})]
           (is (thrown-with-msg?
                ExceptionInfo #"status 400"
                (verify-body app {:email "norule@test.com"
                                  :code code
                                  :extra-fields {"username" "sneaky"}})))))

       (testing "create rule does not run for existing users"
         (rule-model/put! {:app-id app-id
                           :code {"$users" {"allow" {"create" "false"}}}})
         ;; default@test.com already exists from previous test
         (let [code (send-code app {:email "default@test.com"})
               body (verify-body app {:email "default@test.com"
                                      :code code})]
           (is (false? (:created body)))))))))

(deftest users-create-rule-admin-bypass-test
  (with-empty-app
    (fn [{app-id :id :as app}]
      (testing "admin SDK bypasses create rule"
        (rule-model/put! {:app-id app-id
                          :code {"$users" {"allow" {"create" "false"}}}})
        (let [code (post-code-admin app {:email "admin-bypass@test.com"})
              body (verify-code-body-admin app {:email "admin-bypass@test.com"
                                                :code code})]
          (is (true? (:created body)))
          (is (= "admin-bypass@test.com" (-> body :user :email))))))))

(deftest users-create-rule-oauth-test
  (with-empty-app
    (fn [{app-id :id}]
      (test-util/make-attrs app-id
                            [[:$users/username]])
      (let [provider (provider-model/create! {:app-id app-id
                                              :provider-name "clerk"})]

        (testing "create rule blocks oauth signup"
          (rule-model/put! {:app-id app-id
                            :code {"$users" {"allow" {"create" "false"}}}})
          (is (thrown-with-msg?
               ExceptionInfo #"Permission denied"
               (route/upsert-oauth-link! {:email "oauth-blocked@test.com"
                                          :sub "oauth-sub-blocked"
                                          :app-id app-id
                                          :provider-id (:id provider)}))))

        (testing "create rule allows oauth signup when passing"
          (rule-model/put! {:app-id app-id
                            :code {"$users" {"allow" {"create" "true"}}}})
          (let [result (route/upsert-oauth-link! {:email "oauth-ok@test.com"
                                                  :sub "oauth-sub-ok"
                                                  :app-id app-id
                                                  :provider-id (:id provider)})]
            (is (true? (:created result)))))))))

(deftest users-create-rule-guest-test
  (with-empty-app
    (fn [{app-id :id :as app}]
      (testing "create rule blocks guest signup"
        (rule-model/put! {:app-id app-id
                          :code {"$users" {"allow" {"create" "false"}}}})
        (is (thrown-with-msg?
             ExceptionInfo #"status 400"
             (sign-in-guest-runtime app))))

      (testing "create rule allows guest signup when passing"
        (rule-model/put! {:app-id app-id
                          :code {"$users" {"allow" {"create" "true"}}}})
        (let [guest (sign-in-guest-runtime app)]
          (is (= "guest" (:type guest)))))

      (testing "$default rules do not affect guest signup"
        (rule-model/put! {:app-id app-id
                          :code {"$default" {"allow" {"$default" "false"}}}})
        (let [guest (sign-in-guest-runtime app)]
          (is (= "guest" (:type guest))))))))

(deftest users-create-rule-transact-blocked-test
  (with-empty-app
    (fn [{app-id :id}]
      (testing "$users creation via transact is blocked even with create rule set to true"
        (rule-model/put! {:app-id app-id
                          :code {"$users" {"allow" {"create" "true"}}}})
        (let [user-id (random-uuid)
              attrs (attr-model/get-by-app-id app-id)
              id-attr (attr-model/seek-by-fwd-ident-name ["$users" "id"] attrs)
              ctx {:db {:conn-pool (aurora/conn-pool :write)}
                   :app-id app-id
                   :attrs attrs
                   :datalog-query-fn d/query
                   :rules (rule-model/get-by-app-id
                           (aurora/conn-pool :read) {:app-id app-id})
                   :current-user nil}]
          (is (thrown-with-msg?
               ExceptionInfo #"system entity"
               (permissioned-tx/transact!
                ctx
                [[:add-triple user-id (:id id-attr) user-id]]))))))))

