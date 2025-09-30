(ns instant.runtime.routes-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer [deftest is testing]]
   [instant.config :as config]
   [instant.fixtures :refer [with-empty-app]]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.postmark :as postmark]
   [instant.util.coll :as coll]
   [instant.util.crypt :as crypt-util]
   [instant.util.json :refer [->json]]
   [instant.util.test :as test-util]
   [instant.util.tracer :as tracer])
  (:import
   [clojure.lang ExceptionInfo]))

(defn request [opts]
  (with-redefs [tracer/*silence-exceptions?* (atom true)]
    (http/request
     (merge-with
      merge
      {:headers {:Content-Type "application/json"}
       :as :json}
      (-> opts
          (coll/update-when :url #(str config/server-origin %))
          (coll/update-when :body ->json))))))

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
             _      (is (= (:id guest) (:id user)))
             _      (is (= "user" (:type user)))
             _      (is (= "1@b.c" (:email user)))

             ;; can't convert guest to existing user
             guest2 (sign-in-guest app)
             code2  (send-code app {:email "1@b.c"})
             user2  (verify-code app {:email         "1@b.c"
                                      :code          code2
                                      :refresh-token (:refresh_token guest2)})
             _      (is (not= (:id guest2) (:id user2)))])))))
