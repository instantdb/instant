(ns instant.runtime.routes-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer [deftest is testing]]
   [instant.config :as config]
   [instant.db.permissioned-transaction :as permissioned-tx]
   [instant.fixtures :refer [with-empty-app]]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.model.app-user-magic-code :as app-user-magic-code-model]
   [instant.postmark :as postmark]
   [instant.util.coll :as coll]
   [instant.util.crypt :as crypt-util]
   [instant.util.json :refer [->json]]
   [instant.util.tracer :as tracer]))

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

(deftest magic-codes-test
  (let [email (atom nil)]
    (with-redefs [postmark/send-structured! #(reset! email %)]
      (with-empty-app
        (fn [{app-id :id}]
          (testing "auth for new user"
            (request {:method :post
                      :url    "/runtime/auth/send_magic_code"
                      :body   {:email  "a@b.c"
                               :app-id app-id}})
            (is (= "a@b.c" (-> @email :to first :email)))
            (let [code (re-find #"\d+" (-> @email :subject))

                  _    (request {:method :post
                                 :url    "/runtime/auth/send_magic_code"
                                 :body   {:email  "a@b.c"
                                          :app-id app-id}})

                  code2 (re-find #"\d+" (-> @email :subject))]

              (testing "can generate two codes"
                (is (not= code code2)))

              (testing "can't use different code"
                (is (= 400 (:status (request {:method :post
                                              :url    "/runtime/auth/verify_magic_code"
                                              :body   {:email  "a@b.c"
                                                       :code   "000000"
                                                       :app-id app-id}
                                              :throw-exceptions false})))))

              (testing "can't use different email"
                (is (= 400 (:status (request {:method :post
                                              :url    "/runtime/auth/verify_magic_code"
                                              :body   {:email  "wrong-email"
                                                       :code   code
                                                       :app-id app-id}
                                              :throw-exceptions false})))))

              (testing "happy path"
                (let [user (-> (request {:method :post
                                         :url    "/runtime/auth/verify_magic_code"
                                         :body   {:email  "a@b.c"
                                                  :code   code
                                                  :app-id app-id}})
                               :body
                               :user)]
                  (is (= (str app-id) (:app_id user)))
                  (is (= "a@b.c" (:email user)))
                  (is (some? (:refresh_token user)))))

              (testing "can't reuse code"
                (is (= 400 (:status (request {:method :post
                                              :url    "/runtime/auth/verify_magic_code"
                                              :body   {:email  "a@b.c"
                                                       :code   code
                                                       :app-id app-id}
                                              :throw-exceptions false})))))

              (testing "can use second unused code"
                (let [user (-> (request {:method :post
                                         :url    "/runtime/auth/verify_magic_code"
                                         :body   {:email  "a@b.c"
                                                  :code   code2
                                                  :app-id app-id}})
                               :body
                               :user)]
                  (is (= (str app-id) (:app_id user)))
                  (is (= "a@b.c" (:email user)))
                  (is (some? (:refresh_token user)))))))

          (testing "auth for existing user"
            (request {:method :post
                      :url    "/runtime/auth/send_magic_code"
                      :body   {:email  "a@b.c"
                               :app-id app-id}})
            (is (= "a@b.c" (-> @email :to first :email)))
            (let [code (re-find #"\d+" (-> @email :subject))
                  user (-> (request {:method :post
                                     :url    "/runtime/auth/verify_magic_code"
                                     :body   {:email  "a@b.c"
                                              :code   code
                                              :app-id app-id}})
                           :body
                           :user)]
              (is (= (str app-id) (:app_id user)))
              (is (= "a@b.c" (:email user)))
              (is (some? (:refresh_token user))))))))))

(deftest magic-codes-expire-test
  (let [email (atom nil)]
    (with-redefs [postmark/send-structured! #(reset! email %)]
      (with-empty-app
        (fn [{app-id :id}]
          (let [update-created-at (fn [code created-at]
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
                                                         ->json)})))]
            (request {:method :post
                      :url    "/runtime/auth/send_magic_code"
                      :body   {:email  "a@b.d"
                               :app-id app-id}})
            (let [code (re-find #"\d+" (-> @email :subject))]
              (update-created-at code (- (System/currentTimeMillis) (* 25 60 60 1000)))
              (is (= 400 (:status (request {:method :post
                                            :url    "/runtime/auth/verify_magic_code"
                                            :body   {:email  "a@b.d"
                                                     :code   code
                                                     :app-id app-id}
                                            :throw-exceptions false})))))

            (request {:method :post
                      :url    "/runtime/auth/send_magic_code"
                      :body   {:email  "a@b.d"
                               :app-id app-id}})
            (let [code (re-find #"\d+" (-> @email :subject))]
              (update-created-at code (- (System/currentTimeMillis) (* 23 60 60 1000)))
              (is (= 200 (:status (request {:method :post
                                            :url    "/runtime/auth/verify_magic_code"
                                            :body   {:email  "a@b.d"
                                                     :code   code
                                                     :app-id app-id}})))))))))))

;; TODO remove after migrating to $magicCodes.email
(deftest magic-code-$user-test-legacy
  (let [email (atom nil)]
    (with-redefs [postmark/send-structured! #(reset! email %)]
      (with-empty-app
        (fn [{app-id :id
              make-ctx :make-ctx}]
          (let [user-id (random-uuid)
                code    (app-user-magic-code-model/rand-code)
                _       (permissioned-tx/transact!
                         (make-ctx {:admin? true})
                         [{:id    user-id
                           :etype "$users"
                           :email "a@b.c"}
                          {:id    (random-uuid)
                           :etype "$magicCodes"
                           :$user user-id
                           :codeHash (-> code
                                         crypt-util/str->sha256
                                         crypt-util/bytes->hex-string)}])
                user    (-> (request {:method :post
                                      :url    "/runtime/auth/verify_magic_code"
                                      :body   {:email  "a@b.c"
                                               :code   code
                                               :app-id app-id}})
                            :body
                            :user)]
            (is (= (str app-id) (:app_id user)))
            (is (= "a@b.c" (:email user)))
            (is (some? (:refresh_token user)))))))))
