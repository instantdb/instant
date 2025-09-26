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

(defn send-code-runtime [app email]
  (let [letter (atom nil)]
    (with-redefs [postmark/send-structured! #(reset! letter %)]
      (request {:method :post
                :url    "/runtime/auth/send_magic_code"
                :body   {:email  email
                         :app-id (:id app)}}))
    (re-find #"\d+" (-> @letter :subject))))

(defn post-code-admin [app email]
  (-> (request {:method :post
                :url     "/admin/magic_code"
                :headers {"app-id"        (:id app)
                          "authorization" (str "Bearer " (:admin-token app))}
                :body    {:email email}})
      :body
      :code))

(defn send-code-admin [app email]
  (let [letter (atom nil)]
    (with-redefs [postmark/send-structured! #(reset! letter %)]
      (let [resp (request {:method  :post
                           :url     "/admin/send_magic_code"
                           :headers {"app-id"        (:id app)
                                     "authorization" (str "Bearer " (:admin-token app))}
                           :body    {:email email}})
            code-email (re-find #"\d+" (-> @letter :subject))
            code-resp  (-> resp :body :code)]
        (is (= code-email code-resp))
        code-email))))

(defn verify-code-runtime [app email code]
  (-> (request {:method :post
                :url    "/runtime/auth/verify_magic_code"
                :body   {:email  email
                         :code   code
                         :app-id (:id app)}})
      :body
      :user))

(defn verify-code-admin [app email code]
  (-> (request {:method :post
                :url     "/admin/verify_magic_code"
                :headers {"app-id"        (:id app)
                          "authorization" (str "Bearer " (:admin-token app))}
                :body    {:email email
                          :code  code}})
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
         (let [code  (send-code app "a@b.c")
               code2 (send-code app "a@b.c")]

           (testing "can generate two codes"
             (is (not= code code2)))

           (testing "can't use different code"
             (is (thrown-with-msg? ExceptionInfo #"status 400" (verify-code app "a@b.c" "000000"))))

           (testing "can't use different email"
             (is (thrown-with-msg? ExceptionInfo #"status 400" (verify-code app "wrong-email" code))))

           (testing "happy path"
             (let [user (verify-code app "a@b.c" code)]
               (is (= (str app-id) (:app_id user)))
               (is (= "a@b.c" (:email user)))
               (is (some? (:refresh_token user)))))

           (testing "can't reuse code"
             (is (thrown-with-msg? ExceptionInfo #"status 400" (verify-code app "a@b.c" code))))

           (testing "can use second unused code"
             (let [user (verify-code app "a@b.c" code2)]
               (is (= (str app-id) (:app_id user)))
               (is (= "a@b.c" (:email user)))
               (is (some? (:refresh_token user)))))

           (testing "auth for existing user"
             (let [code3 (send-code app "a@b.c")
                   _     (is (not= code code3))
                   _     (is (not= code2 code3))
                   user  (verify-code app "a@b.c" code3)]
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
       (let [code (send-code app "a@b.c")]
         (update-created-at app-id code (- (System/currentTimeMillis) (* 25 60 60 1000)))
         (is (thrown-with-msg? ExceptionInfo #"status 400" (verify-code app "a@b.c" code))))

       (let [code (send-code app "a@b.c")]
         (update-created-at app-id code (- (System/currentTimeMillis) (* 23 60 60 1000)))
         (is (= "a@b.c" (:email (verify-code app "a@b.c" code)))))))))
