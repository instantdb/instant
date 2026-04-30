(ns instant.webhook-routes-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [instant.core :as core]
   [instant.fixtures :refer [with-empty-app]]
   [instant.isn :as isn]
   [instant.jdbc.aurora :as aurora]
   [instant.model.history :as history]
   [instant.model.webhook-test :as webhook-test]
   [instant.util.coll :as coll]
   [instant.util.json :refer [->json <-json]]
   [instant.util.test :as test-util]
   [instant.util.tracer :as tracer]
   [instant.webhook-jwt :as webhook-jwt])
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
                              (coll/update-when :body
                                                (fn [body]
                                                  (ByteArrayInputStream.
                                                   (.getBytes ^String (->json body) "UTF-8"))))))
          resp (-> ((core/handler) req)
                   (update :body (fn [body]
                                   (<-json body true))))]
      (if (not= 200 (:status resp))
        (throw (ex-info (str "status " (:status resp)) resp))
        resp))))

(deftest get-payload-test
  (with-empty-app
    (fn [app]
      (let [attrs (test-util/make-attrs (:id app)
                                        [[:users/id :unique? :index?]
                                         [:users/name]])
            id-aid (:users/id attrs)
            name-aid (:users/name attrs)
            webhook-id (random-uuid)
            user-id (random-uuid)
            isn (isn/test-isn 1)
            wal-record (webhook-test/make-wal-record
                        {:app-id (:id app)
                         :isn isn
                         :previous-isn (isn/test-isn 0)
                         :triple-changes
                         [(webhook-test/triple-insert (:id app) user-id id-aid (str user-id))
                          (webhook-test/triple-insert (:id app) user-id name-aid "alice")]
                         :messages
                         [(webhook-test/update-ents-message
                           [["users" (str user-id)
                             {(str id-aid) (str user-id)
                              (str name-aid) "alice"}]])]})
            url (str "/webhooks/payload/" (:id app) "/" webhook-id "/" isn)]
        (webhook-test/with-history-cleanup isn
          (webhook-test/insert-webhook! {:app-id (:id app)
                                         :webhook-id webhook-id
                                         :id-attr-ids [id-aid]
                                         :actions ["create" "update" "delete"]})
          (with-redefs [history/store-to-s3? (fn [] false)]
            (history/push! (aurora/conn-pool :write) wal-record))

          (testing "admin token returns the payload"
            (let [resp (request {:method :get
                                 :url url
                                 :headers {"app-id" (str (:id app))
                                           "authorization" (str "Bearer " (:admin-token app))}})
                  records (-> resp :body :data)]
              (is (= 200 (:status resp)))
              (is (= 1 (count records)))
              (let [{:keys [etype action id after]} (first records)]
                (is (= "users" etype))
                (is (= "create" action))
                (is (= (str user-id) id))
                (is (= {:id (str user-id) :name "alice"} after)))))

          (testing "JWT bearer returns the payload"
            (let [jwt (webhook-jwt/webhook-payload-jwt
                       {:app-id (:id app)
                        :webhook-id webhook-id
                        :isn isn})
                  resp (request {:method :get
                                 :url url
                                 :headers {"authorization" (str "Bearer " jwt)}})]
              (is (= 200 (:status resp)))
              (is (= 1 (count (-> resp :body :data))))))

          (testing "missing authorization header is rejected"
            (is (thrown-with-msg? ExceptionInfo #"status 400"
                                  (request {:method :get
                                            :url url}))))

          (testing "unknown webhook-id is rejected"
            (is (thrown-with-msg? ExceptionInfo #"status 400"
                                  (request {:method :get
                                            :url (str "/webhooks/payload/"
                                                      (:id app) "/"
                                                      (random-uuid) "/"
                                                      isn)
                                            :headers {"app-id" (str (:id app))
                                                      "authorization" (str "Bearer " (:admin-token app))}}))))

          (testing "JWT with mismatched isn is rejected"
            (let [jwt (webhook-jwt/webhook-payload-jwt
                       {:app-id (:id app)
                        :webhook-id webhook-id
                        :isn (isn/test-isn 99)})]
              (is (thrown-with-msg? ExceptionInfo #"status 400"
                                    (request {:method :get
                                              :url url
                                              :headers {"authorization" (str "Bearer " jwt)}}))))))))))
