(ns instant.model.webhook-test
  (:require
   [clojure.test :refer [deftest is]]
   [instant.fixtures :refer [with-empty-app]]
   [instant.grpc :as grpc]
   [instant.isn :as isn]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.model.history :as history]
   [instant.model.webhook :as webhook]
   [instant.util.crypt :as crypt-util]
   [instant.util.hsql :as uhsql]
   [instant.util.json :as json]
   [instant.util.test :as test-util]
   [instant.webhook-routes :as webhook-routes])
  (:import
   (instant.jdbc WalColumn WalEntry)
   (java.math BigInteger)
   (java.nio.charset StandardCharsets)
   (java.security KeyFactory PublicKey Signature)
   (java.security.spec EdECPoint EdECPublicKeySpec NamedParameterSpec)
   (java.time Instant)
   (java.util Base64)))

(defn jwk->public-key ^PublicKey [{:keys [x]}]
  (let [key-bytes (.decode (Base64/getUrlDecoder) ^String x)
        x-odd? (not (zero? (bit-and (aget key-bytes 31) 0x80)))
        y-bytes (byte-array key-bytes)
        _ (aset y-bytes 31 (byte (bit-and (aget y-bytes 31) 0x7F)))
        be-bytes (byte-array (reverse y-bytes))
        y (BigInteger. 1 be-bytes)
        spec (EdECPublicKeySpec. NamedParameterSpec/ED25519
                                 (EdECPoint. x-odd? y))]
    (.generatePublic (KeyFactory/getInstance "Ed25519") spec)))

(deftest sign-webhook-signature-verifies
  (let [body "{\"event\":\"create\"}"
        {:keys [kid signature t]} (webhook/sign-webhook body)
        jwk (->> (webhook-routes/get-signing-keys nil)
                 :body
                 :keys
                 (filter #(= kid (:kid %)))
                 first)
        pub-key (jwk->public-key jwk)
        sig-bytes (crypt-util/hex-string->bytes signature)
        verifier (doto (Signature/getInstance "Ed25519")
                   (.initVerify pub-key)
                   (.update (.getBytes (str t "." body)
                                       StandardCharsets/UTF_8)))

        verifies? (.verify verifier sig-bytes)]
    (is verifies?)))

(def insert-webhook-q
  (uhsql/preformat
   {:insert-into :webhooks
    :values [{:id :?id
              :app-id :?app-id
              :topics [:inline 0]
              :id-attr-ids :?id-attr-ids
              :actions :?actions
              :processed-isn :?processed-isn
              :sink [:cast :?sink :jsonb]}]}))

(defn insert-webhook! [{:keys [app-id webhook-id id-attr-ids actions]}]
  (sql/do-execute!
   (aurora/conn-pool :write)
   (uhsql/formatp insert-webhook-q
                  {:id webhook-id
                   :app-id app-id
                   :id-attr-ids (with-meta (vec id-attr-ids) {:pgtype "uuid[]"})
                   :actions (with-meta (vec actions) {:pgtype "webhook_action[]"})
                   :processed-isn (isn/test-isn 0)
                   :sink (json/->json {:url "http://example.com"})})))

(defn triple-cols [app-id eid aid value]
  [(WalColumn. "app_id" (str app-id))
   (WalColumn. "entity_id" (str eid))
   (WalColumn. "attr_id" (str aid))
   (WalColumn. "value" (json/->json value))])

(defn triple-insert [app-id eid aid value]
  (WalEntry. :insert 0 "triples"
             (triple-cols app-id eid aid value)
             nil nil nil nil nil))

(defn triple-update [app-id eid aid old-value new-value]
  (WalEntry. :update 0 "triples"
             (triple-cols app-id eid aid new-value)
             (triple-cols app-id eid aid old-value)
             nil nil nil nil))

(defn triple-delete [app-id eid aid value]
  (WalEntry. :delete 0 "triples"
             nil
             (triple-cols app-id eid aid value)
             nil nil nil nil))

(defn update-ents-message [content]
  (WalEntry. :message 0 nil nil nil
             "update_ents"
             (json/->json content)
             nil nil))

(defn make-wal-record [{:keys [app-id isn previous-isn triple-changes messages]}]
  (grpc/->WalRecord
   app-id 1 isn previous-isn
   (Instant/parse "2026-01-01T00:00:00Z") 0 nil
   [] []
   (vec triple-changes)
   (vec messages)
   []))

(defmacro with-history-cleanup [isn & body]
  `(let [isn# ~isn]
     (sql/do-execute! (aurora/conn-pool :write)
                      ["delete from history where isn = ?" isn#])
     (try
       ~@body
       (finally
         (sql/do-execute! (aurora/conn-pool :write)
                          ["delete from history where isn = ?" isn#])))))

(defn fetch-webhook-data [{:keys [app-id webhook-id isn]}]
  (let [stored-webhook (webhook/get-by-app-id-and-webhook-id!
                        {:app-id app-id
                         :webhook-id webhook-id})]
    (webhook/webhook-data-for-isn
     (aurora/conn-pool :read)
     {:app-id app-id
      :isn isn
      :webhook stored-webhook})))

(deftest webhook-data-for-isn-returns-create-record
  (with-empty-app
    (fn [app]
      (let [attrs (test-util/make-attrs (:id app)
                                        [[:users/id :unique? :index?]
                                         [:users/name]])
            id-aid (:users/id attrs)
            name-aid (:users/name attrs)
            user-a-id (test-util/stuid "ua")
            user-b-id (test-util/stuid "ub")
            webhook-id (random-uuid)
            isn (isn/test-isn 1)
            wal-record (make-wal-record
                        {:app-id (:id app)
                         :isn isn
                         :previous-isn (isn/test-isn 0)
                         :triple-changes
                         [;; create users/A — should appear in the result
                          (triple-insert (:id app) user-a-id id-aid (str user-a-id))
                          (triple-insert (:id app) user-a-id name-aid "alice")
                          ;; update users/B's name — should be ignored (action filter)
                          (triple-update (:id app) user-b-id name-aid "old-bob" "bob")]
                         :messages
                         [(update-ents-message
                           [["users" (str user-a-id)
                             {(str id-aid) (str user-a-id)
                              (str name-aid) "alice"}]
                            ["users" (str user-b-id)
                             {(str id-aid) (str user-b-id)
                              (str name-aid) "bob"}]])]})]
        (with-history-cleanup isn
          (insert-webhook! {:app-id (:id app)
                            :webhook-id webhook-id
                            :id-attr-ids [id-aid]
                            :actions ["create"]})
          (with-redefs [history/store-to-s3? (fn [] false)]
            (history/push! (aurora/conn-pool :write) wal-record))
          (let [data (fetch-webhook-data {:app-id (:id app)
                                          :webhook-id webhook-id
                                          :isn isn})]
            (is (= 1 (count data)))
            (let [{:keys [etype action id before after idempotency-key]} (first data)]
              (is (= "users" etype))
              (is (= "create" action))
              (is (= user-a-id id))
              (is (nil? before))
              (is (= {"id" (str user-a-id) "name" "alice"} after))
              ;; This is hardcoded for a good reason. If we change the
              ;; algorithm that creates the key, it needs to be in a backwards
              ;; compatible way.
              (is (= #uuid "f1d42c0f-357c-4a5b-40da-412167ffea45"
                     idempotency-key)))
            ;; calling it twice returns the same idempotency keys
            (is (= (map :idempotency-key data)
                   (map :idempotency-key
                        (fetch-webhook-data {:app-id (:id app)
                                             :webhook-id webhook-id
                                             :isn isn}))))))))))

(deftest webhook-data-for-isn-returns-update-record
  (with-empty-app
    (fn [app]
      (let [attrs (test-util/make-attrs (:id app)
                                        [[:users/id :unique? :index?]
                                         [:users/name]])
            id-aid (:users/id attrs)
            name-aid (:users/name attrs)
            user-a-id (test-util/stuid "ua")
            user-b-id (test-util/stuid "ub")
            webhook-id (random-uuid)
            isn (isn/test-isn 2)
            wal-record (make-wal-record
                        {:app-id (:id app)
                         :isn isn
                         :previous-isn (isn/test-isn 1)
                         :triple-changes
                         [;; update users/A's name — should appear in the result
                          (triple-update (:id app) user-a-id name-aid "old-alice" "alice")
                          ;; delete users/B — should be ignored (action filter)
                          (triple-delete (:id app) user-b-id id-aid (str user-b-id))
                          (triple-delete (:id app) user-b-id name-aid "bob")]
                         :messages
                         [(update-ents-message
                           [["users" (str user-a-id)
                             {(str id-aid) (str user-a-id)
                              (str name-aid) "alice"}]])]})]
        (with-history-cleanup isn
          (insert-webhook! {:app-id (:id app)
                            :webhook-id webhook-id
                            :id-attr-ids [id-aid]
                            :actions ["update"]})
          (with-redefs [history/store-to-s3? (fn [] false)]
            (history/push! (aurora/conn-pool :write) wal-record))
          (let [data (fetch-webhook-data {:app-id (:id app)
                                          :webhook-id webhook-id
                                          :isn isn})]
            (is (= 1 (count data)))
            (let [{:keys [etype action id before after idempotency-key]} (first data)]
              (is (= "users" etype))
              (is (= "update" action))
              (is (= user-a-id id))
              (is (= {"id" (str user-a-id) "name" "old-alice"} before))
              (is (= {"id" (str user-a-id) "name" "alice"} after))
              (is (= #uuid "e84c8ae9-634f-7ae8-51c5-93cf4ab23f40"
                     idempotency-key)))
            ;; calling it twice returns the same idempotency keys
            (is (= (map :idempotency-key data)
                   (map :idempotency-key
                        (fetch-webhook-data {:app-id (:id app)
                                             :webhook-id webhook-id
                                             :isn isn}))))))))))

(deftest webhook-data-for-isn-returns-delete-record
  (with-empty-app
    (fn [app]
      (let [attrs (test-util/make-attrs (:id app)
                                        [[:users/id :unique? :index?]
                                         [:users/name]])
            id-aid (:users/id attrs)
            name-aid (:users/name attrs)
            user-a-id (test-util/stuid "ua")
            user-b-id (test-util/stuid "ub")
            webhook-id (random-uuid)
            isn (isn/test-isn 3)
            wal-record (make-wal-record
                        {:app-id (:id app)
                         :isn isn
                         :previous-isn (isn/test-isn 2)
                         :triple-changes
                         [;; delete users/A — should appear in the result
                          (triple-delete (:id app) user-a-id id-aid (str user-a-id))
                          (triple-delete (:id app) user-a-id name-aid "alice")
                          ;; create users/B — should be ignored (action filter)
                          (triple-insert (:id app) user-b-id id-aid (str user-b-id))
                          (triple-insert (:id app) user-b-id name-aid "bob")]
                         :messages
                         [(update-ents-message
                           [["users" (str user-b-id)
                             {(str id-aid) (str user-b-id)
                              (str name-aid) "bob"}]])]})]
        (with-history-cleanup isn
          (insert-webhook! {:app-id (:id app)
                            :webhook-id webhook-id
                            :id-attr-ids [id-aid]
                            :actions ["delete"]})
          (with-redefs [history/store-to-s3? (fn [] false)]
            (history/push! (aurora/conn-pool :write) wal-record))
          (let [data (fetch-webhook-data {:app-id (:id app)
                                          :webhook-id webhook-id
                                          :isn isn})]
            (is (= 1 (count data)))
            (let [{:keys [etype action id before after idempotency-key]} (first data)]
              (is (= "users" etype))
              (is (= "delete" action))
              (is (= user-a-id id))
              (is (= {"id" (str user-a-id) "name" "alice"} before))
              (is (nil? after))
              (is (= #uuid "3f379d1b-3382-6ff0-a82e-197a252a6ac1"
                     idempotency-key)))
            ;; calling it twice returns the same idempotency keys
            (is (= (map :idempotency-key data)
                   (map :idempotency-key
                        (fetch-webhook-data {:app-id (:id app)
                                             :webhook-id webhook-id
                                             :isn isn}))))))))))

(deftest webhook-data-for-isn-mixed-etypes-and-webhooks
  (with-empty-app
    (fn [app]
      (let [attrs (test-util/make-attrs
                   (:id app)
                   [[:users/id :unique? :index?]
                    [:users/name]
                    [:books/id :unique? :index?]
                    [:books/title]])
            users-id-aid (:users/id attrs)
            users-name-aid (:users/name attrs)
            books-id-aid (:books/id attrs)
            books-title-aid (:books/title attrs)
            ;; users — stuid only encodes letters a-z, so suffix with letters
            u1-id (test-util/stuid "ua")  ;; created
            u2-id (test-util/stuid "ub")  ;; updated
            u3-id (test-util/stuid "uc")  ;; deleted
            ;; books
            b1-id (test-util/stuid "ba")  ;; created
            b2-id (test-util/stuid "bb")  ;; updated
            b3-id (test-util/stuid "bc")  ;; deleted
            isn (isn/test-isn 4)
            wal-record (make-wal-record
                        {:app-id (:id app)
                         :isn isn
                         :previous-isn (isn/test-isn 3)
                         :triple-changes
                         [;; users
                          (triple-insert (:id app) u1-id users-id-aid (str u1-id))
                          (triple-insert (:id app) u1-id users-name-aid "u1")
                          (triple-update (:id app) u2-id users-name-aid "old-u2" "u2")
                          (triple-delete (:id app) u3-id users-id-aid (str u3-id))
                          (triple-delete (:id app) u3-id users-name-aid "u3")
                          ;; books
                          (triple-insert (:id app) b1-id books-id-aid (str b1-id))
                          (triple-insert (:id app) b1-id books-title-aid "b1")
                          (triple-update (:id app) b2-id books-title-aid "old-b2" "b2")
                          (triple-delete (:id app) b3-id books-id-aid (str b3-id))
                          (triple-delete (:id app) b3-id books-title-aid "b3")]
                         :messages
                         [(update-ents-message
                           [["users" (str u1-id)
                             {(str users-id-aid) (str u1-id)
                              (str users-name-aid) "u1"}]
                            ["users" (str u2-id)
                             {(str users-id-aid) (str u2-id)
                              (str users-name-aid) "u2"}]
                            ["books" (str b1-id)
                             {(str books-id-aid) (str b1-id)
                              (str books-title-aid) "b1"}]
                            ["books" (str b2-id)
                             {(str books-id-aid) (str b2-id)
                              (str books-title-aid) "b2"}]])]})
            users-all-id (random-uuid)
            books-all-id (random-uuid)
            users-update-only-id (random-uuid)
            users-create-delete-id (random-uuid)]
        (with-history-cleanup isn
          (with-redefs [history/store-to-s3? (fn [] false)]
            (history/push! (aurora/conn-pool :write) wal-record))
          (insert-webhook! {:app-id (:id app)
                            :webhook-id users-all-id
                            :id-attr-ids [users-id-aid]
                            :actions ["create" "update" "delete"]})
          (insert-webhook! {:app-id (:id app)
                            :webhook-id books-all-id
                            :id-attr-ids [books-id-aid]
                            :actions ["create" "update" "delete"]})
          (insert-webhook! {:app-id (:id app)
                            :webhook-id users-update-only-id
                            :id-attr-ids [users-id-aid]
                            :actions ["update"]})
          (insert-webhook! {:app-id (:id app)
                            :webhook-id users-create-delete-id
                            :id-attr-ids [users-id-aid]
                            :actions ["create" "delete"]})
          (let [fetch-data (fn [webhook-id]
                             (fetch-webhook-data {:app-id (:id app)
                                                  :webhook-id webhook-id
                                                  :isn isn}))
                summarize (fn [data]
                            (->> data
                                 (map (fn [r] (select-keys r [:etype :action :id :idempotency-key])))
                                 set))]
            ;; users + all actions: create u1, update u2, delete u3
            (is (= #{{:etype "users" :action "create" :id u1-id
                      :idempotency-key #uuid "f9a00dff-7d6b-7d56-161a-6b8fbfca5551"}
                     {:etype "users" :action "update" :id u2-id
                      :idempotency-key #uuid "84d64dec-f9b4-9787-c3e9-907334861f06"}
                     {:etype "users" :action "delete" :id u3-id
                      :idempotency-key #uuid "e68d0121-4503-d213-6a53-a87de0c1b505"}}
                   (summarize (fetch-data users-all-id))))
            ;; books + all actions: create b1, update b2, delete b3
            (is (= #{{:etype "books" :action "create" :id b1-id
                      :idempotency-key #uuid "414a797c-83ec-2c0c-e57d-4f54caad348e"}
                     {:etype "books" :action "update" :id b2-id
                      :idempotency-key #uuid "65bfa883-7b21-ab05-0fd0-48ff3a0fac60"}
                     {:etype "books" :action "delete" :id b3-id
                      :idempotency-key #uuid "6e09fde1-c661-d3a3-7968-7de191b36a18"}}
                   (summarize (fetch-data books-all-id))))
            ;; users + update only
            (is (= #{{:etype "users" :action "update" :id u2-id
                      :idempotency-key #uuid "84d64dec-f9b4-9787-c3e9-907334861f06"}}
                   (summarize (fetch-data users-update-only-id))))
            ;; users + create/delete only
            (is (= #{{:etype "users" :action "create" :id u1-id
                      :idempotency-key #uuid "f9a00dff-7d6b-7d56-161a-6b8fbfca5551"}
                     {:etype "users" :action "delete" :id u3-id
                      :idempotency-key #uuid "e68d0121-4503-d213-6a53-a87de0c1b505"}}
                   (summarize (fetch-data users-create-delete-id))))
            ;; calling it twice returns the same idempotency keys
            (is (= (summarize (fetch-data users-all-id))
                   (summarize (fetch-data users-all-id))))))))))
