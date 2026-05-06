(ns instant.model.webhook-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [instant.db.model.attr :as attr-model]
   [instant.db.transaction :as tx]
   [instant.fixtures :refer [with-empty-app]]
   [instant.flags :as flags]
   [instant.grpc :as grpc]
   [instant.isn :as isn]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.model.history :as history]
   [instant.model.webhook :as webhook]
   [instant.util.hsql :as uhsql]
   [instant.util.json :as json]
   [instant.util.test :as test-util]
   [instant.webhook-sender :as webhook-sender])
  (:import
   (instant.jdbc WalColumn WalEntry)
   (java.time Instant)))

(def insert-webhook-q
  (uhsql/preformat
   {:insert-into :webhooks
    :values [{:id :?id
              :app-id :?app-id
              :topics [:inline 0]
              :id-attr-ids :?id-attr-ids
              :actions :?actions
              :sink [:cast :?sink :jsonb]}]}))

(defn insert-webhook! [{:keys [app-id webhook-id id-attr-ids actions]}]
  (sql/do-execute!
   (aurora/conn-pool :write)
   (uhsql/formatp insert-webhook-q
                  {:id webhook-id
                   :app-id app-id
                   :id-attr-ids (with-meta (vec id-attr-ids) {:pgtype "uuid[]"})
                   :actions (with-meta (vec actions) {:pgtype "webhook_action[]"})
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
            (let [{:keys [etype action id before after idempotencyKey]} (first data)]
              (is (= "users" etype))
              (is (= "create" action))
              (is (= user-a-id id))
              (is (nil? before))
              (is (= {"id" (str user-a-id) "name" "alice"} after))
              ;; This is hardcoded for a good reason. If we change the
              ;; algorithm that creates the key, it needs to be in a backwards
              ;; compatible way.
              (is (= #uuid "f1d42c0f-357c-4a5b-40da-412167ffea45"
                     idempotencyKey)))
            ;; calling it twice returns the same idempotency keys
            (is (= (map :idempotencyKey data)
                   (map :idempotencyKey
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
            (let [{:keys [etype action id before after idempotencyKey]} (first data)]
              (is (= "users" etype))
              (is (= "update" action))
              (is (= user-a-id id))
              (is (= {"id" (str user-a-id) "name" "old-alice"} before))
              (is (= {"id" (str user-a-id) "name" "alice"} after))
              (is (= #uuid "e84c8ae9-634f-7ae8-51c5-93cf4ab23f40"
                     idempotencyKey)))
            ;; calling it twice returns the same idempotency keys
            (is (= (map :idempotencyKey data)
                   (map :idempotencyKey
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
            (let [{:keys [etype action id before after idempotencyKey]} (first data)]
              (is (= "users" etype))
              (is (= "delete" action))
              (is (= user-a-id id))
              (is (= {"id" (str user-a-id) "name" "alice"} before))
              (is (nil? after))
              (is (= #uuid "3f379d1b-3382-6ff0-a82e-197a252a6ac1"
                     idempotencyKey)))
            ;; calling it twice returns the same idempotency keys
            (is (= (map :idempotencyKey data)
                   (map :idempotencyKey
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
                                 (map (fn [r] (select-keys r [:etype :action :id :idempotencyKey])))
                                 set))]
            ;; users + all actions: create u1, update u2, delete u3
            (is (= #{{:etype "users" :action "create" :id u1-id
                      :idempotencyKey #uuid "f9a00dff-7d6b-7d56-161a-6b8fbfca5551"}
                     {:etype "users" :action "update" :id u2-id
                      :idempotencyKey #uuid "84d64dec-f9b4-9787-c3e9-907334861f06"}
                     {:etype "users" :action "delete" :id u3-id
                      :idempotencyKey #uuid "e68d0121-4503-d213-6a53-a87de0c1b505"}}
                   (summarize (fetch-data users-all-id))))
            ;; books + all actions: create b1, update b2, delete b3
            (is (= #{{:etype "books" :action "create" :id b1-id
                      :idempotencyKey #uuid "414a797c-83ec-2c0c-e57d-4f54caad348e"}
                     {:etype "books" :action "update" :id b2-id
                      :idempotencyKey #uuid "65bfa883-7b21-ab05-0fd0-48ff3a0fac60"}
                     {:etype "books" :action "delete" :id b3-id
                      :idempotencyKey #uuid "6e09fde1-c661-d3a3-7968-7de191b36a18"}}
                   (summarize (fetch-data books-all-id))))
            ;; users + update only
            (is (= #{{:etype "users" :action "update" :id u2-id
                      :idempotencyKey #uuid "84d64dec-f9b4-9787-c3e9-907334861f06"}}
                   (summarize (fetch-data users-update-only-id))))
            ;; users + create/delete only
            (is (= #{{:etype "users" :action "create" :id u1-id
                      :idempotencyKey #uuid "f9a00dff-7d6b-7d56-161a-6b8fbfca5551"}
                     {:etype "users" :action "delete" :id u3-id
                      :idempotencyKey #uuid "e68d0121-4503-d213-6a53-a87de0c1b505"}}
                   (summarize (fetch-data users-create-delete-id))))
            ;; calling it twice returns the same idempotency keys
            (is (= (summarize (fetch-data users-all-id))
                   (summarize (fetch-data users-all-id))))))))))

(deftest attnums-are-correct
  ;; We look up the attr-id and pg-size by index. This test makes sure that
  ;; we don't make any changes that would affect the index of those fields.
  (let [columns
        (sql/select (aurora/conn-pool :read)
                    ["select attname AS column_name
                       from pg_attribute
                       where attrelid = 'triples'::regclass
                             and attnum > 0
                             and not attisdropped
                       order by attnum asc"])]
    ;; If this test fails, then we need to update the code that checks the attr-id column
    (is (= "attr_id" (:column_name (nth columns webhook/attr-id-column-idx)))
        "The attr_id column should be the third column in the triples table")
    (is (= "pg_size" (:column_name (nth columns webhook/pg-size-column-idx)))
        "The pg_size column should be the 12th column in the triples table")))

(deftest cant-create-more-than-max-webhooks
  (with-redefs [webhook/maximum-active-webhooks (constantly 10)
                webhook-sender/validate-url (constantly nil)]
    (with-empty-app
      (fn [app]
        (test-util/make-attrs (:id app) [[:users/id :unique? :index?]])
        (let [params {:app-id (:id app)
                      :etypes ["users"]
                      :actions ["create"]
                      :url "https://example.com/hook"}
              start-promise (promise)
              ;; Race to create a bunch of webhooks
              tasks (mapv (fn [_]
                            (future
                              (try
                                @start-promise
                                [:ok (webhook/create! params)]
                                (catch Exception e [:err e]))))
                          (range 20))
              _ (deliver start-promise true)
              results (mapv deref tasks)
              {oks :ok errs :err} (group-by first results)]
          (is (= 10 (count oks)))
          (is (= 10 (count errs)))
          (doseq [[_ e] errs]
            (is (re-find #"may not have more than 10 active webhooks"
                         (.getMessage ^Exception e))))
          ;; Disabled webhooks don't count against the limit.
          (let [{disabled-id :id} (sql/select-one (aurora/conn-pool :read)
                                                  ["select id from webhooks where app_id = ? limit 1" (:id app)])]
            (webhook/disable! {:app-id (:id app)
                               :webhook-id disabled-id
                               :reason "test"})
            (is (webhook/create! params))))))))

(deftest disable-and-enable-invalidate-webhook-cache
  (with-empty-app
    (fn [app]
      (let [attrs (test-util/make-attrs (:id app) [[:users/id :unique? :index?]])
            id-aid (:users/id attrs)
            webhook-id (random-uuid)
            params {:app-id (:id app)
                    :webhook-id webhook-id}]
        (insert-webhook! {:app-id (:id app)
                          :webhook-id webhook-id
                          :id-attr-ids [id-aid]
                          :actions ["create"]})
        (try
          (is (= "active" (:status (webhook/get-by-app-id-and-webhook-id! params))))

          (webhook/disable! (assoc params :reason "test disable"))
          (let [{:keys [status disabled_reason]}
                (webhook/get-by-app-id-and-webhook-id! params)]
            (is (= "disabled" status))
            (is (= "test disable" disabled_reason)))

          (webhook/enable! (assoc params :reason "test enable"))
          (let [{:keys [status disabled_reason]}
                (webhook/get-by-app-id-and-webhook-id! params)]
            (is (= "active" status))
            (is (nil? disabled_reason)))
          (finally
            (webhook/evict-webhook-from-cache params)))))))

(deftest retries-only-max-attempts-times
  (with-empty-app
    (fn [app]
      (let [attrs (test-util/make-attrs (:id app) [[:users/id :unique? :index?]])
            id-aid (:users/id attrs)
            webhook-id (random-uuid)
            isn (isn/test-isn 100)
            partition-bucket (history/partition-bucket-for-time (Instant/now))
            machine-id (random-uuid)
            failed-attempt (webhook-sender/->WebhookAttempt
                            (Instant/now) 100 false 500 "fail" "network" "Network error.")]
        (insert-webhook! {:app-id (:id app)
                          :webhook-id webhook-id
                          :id-attr-ids [id-aid]
                          :actions ["create"]})
        (sql/do-execute! (aurora/conn-pool :write)
                         ["insert into webhook_events
                            (webhook_id, isn, app_id, status, machine_id, partition_bucket)
                            values (?, ?, ?, 'processing'::webhook_event_status, ?, ?)"
                          webhook-id isn (:id app) machine-id partition-bucket])
        (try
          (dotimes [n webhook/max-attempts]
            (let [event (sql/select-one
                         (aurora/conn-pool :read)
                         ["select webhook_id, app_id, isn, partition_bucket,
                                  coalesce(cardinality(attempts), 0) as attempt_count
                            from webhook_events
                            where webhook_id = ? and isn = ? and partition_bucket = ?"
                          webhook-id isn partition-bucket])]
              (webhook/record-attempt! (aurora/conn-pool :write) event failed-attempt machine-id)
              (let [{:keys [status next_attempt_after]}
                    (sql/select-one (aurora/conn-pool :read)
                                    ["select status, next_attempt_after from webhook_events
                                       where webhook_id = ? and isn = ? and partition_bucket = ?"
                                     webhook-id isn partition-bucket])
                    last? (= (inc n) webhook/max-attempts)]
                (if last?
                  (do (is (= "failed" status))
                      (is (nil? next_attempt_after)))
                  (do (is (= "error" status))
                      (is (some? next_attempt_after))
                      ;; simulate the retry-claim re-locking the row for the next pass
                      (sql/do-execute!
                       (aurora/conn-pool :write)
                       ["update webhook_events
                            set status = 'processing'::webhook_event_status,
                                machine_id = ?
                          where webhook_id = ? and isn = ? and partition_bucket = ?"
                        machine-id webhook-id isn partition-bucket]))))))
          (let [attempts (:attempts (sql/select-one (aurora/conn-pool :read)
                                                    ["select * from webhook_events where webhook_id = ? and isn = ?"
                                                     webhook-id isn]))]
            (is (= (count attempts) webhook/max-attempts))
            (is (every? #(false? (:success? %)) attempts)))

          (finally
            (sql/do-execute! (aurora/conn-pool :write)
                             ["delete from webhook_events
                                where webhook_id = ? and isn = ? and partition_bucket = ?"
                              webhook-id isn partition-bucket])))))))

(deftest a-410-disables-the-webhook
  (with-empty-app
    (fn [app]
      (let [attrs (test-util/make-attrs (:id app) [[:users/id :unique? :index?]])
            id-aid (:users/id attrs)
            webhook-id (random-uuid)
            isn (isn/test-isn 200)
            partition-bucket (history/partition-bucket-for-time (Instant/now))
            machine-id (random-uuid)
            gone-attempt (webhook-sender/->WebhookAttempt
                          (Instant/now) 100 false 410 "Gone" nil nil)]
        (insert-webhook! {:app-id (:id app)
                          :webhook-id webhook-id
                          :id-attr-ids [id-aid]
                          :actions ["create"]})
        (sql/do-execute! (aurora/conn-pool :write)
                         ["insert into webhook_events
                            (webhook_id, isn, app_id, status, machine_id, partition_bucket)
                            values (?, ?, ?, 'processing'::webhook_event_status, ?, ?)"
                          webhook-id isn (:id app) machine-id partition-bucket])
        (try
          (let [event (sql/select-one
                       (aurora/conn-pool :read)
                       ["select webhook_id, app_id, isn, partition_bucket,
                                coalesce(cardinality(attempts), 0) as attempt_count
                          from webhook_events
                          where webhook_id = ? and isn = ? and partition_bucket = ?"
                        webhook-id isn partition-bucket])]
            (webhook/record-attempt! (aurora/conn-pool :write) event gone-attempt machine-id))
          (let [{wh-status :status :keys [disabled_reason]}
                (sql/select-one (aurora/conn-pool :read)
                                ["select status, disabled_reason from webhooks where id = ?"
                                 webhook-id])
                {ev-status :status}
                (sql/select-one (aurora/conn-pool :read)
                                ["select status from webhook_events
                                   where webhook_id = ? and isn = ? and partition_bucket = ?"
                                 webhook-id isn partition-bucket])]
            (is (= "disabled" wh-status))
            (is (= "Endpoint returned 410 status code." disabled_reason))
            (is (= "failed" ev-status)))
          (finally
            (sql/do-execute! (aurora/conn-pool :write)
                             ["delete from webhook_events
                                where webhook_id = ? and isn = ? and partition_bucket = ?"
                              webhook-id isn partition-bucket])))))))

(deftest webhook-matches?-test
  (with-empty-app
    (fn [app]
      (let [enable-wal-entity-log? (var-get #'flags/enable-wal-entity-log?)]
        (with-redefs [flags/enable-wal-entity-log?
                      (fn [aid]
                        (or (= aid (:id app)) (enable-wal-entity-log? aid)))
                      flags/log-to-wal-log-table?
                      (constantly true)]
          (let [attr->id (test-util/make-attrs (:id app)
                                               [[:users/id :unique? :index?]
                                                [:users/name]])
                attrs (attr-model/get-by-app-id (:id app))
                id-aid (:users/id attr->id)
                name-aid (:users/name attr->id)
                user-id (test-util/stuid "ua")
                other-aid (random-uuid)
                for-app (fn [recs] (filter #(= (:id app) (:app-id %)) recs))]
            (test-util/with-test-replication-slot [records]
              ;; Tx 1: insert a user (id + name triples)
              (tx/transact! (aurora/conn-pool :write) attrs (:id app)
                            [[:add-triple user-id id-aid (str user-id)]
                             [:add-triple user-id name-aid "alice"]])
              ;; Tx 2: update name
              (tx/transact! (aurora/conn-pool :write) attrs (:id app)
                            [[:add-triple user-id name-aid "bob"]])
              ;; Tx 3: delete the user
              (tx/transact! (aurora/conn-pool :write) attrs (:id app)
                            [[:delete-entity user-id "users"]])
              (test-util/wait-for #(<= 3 (count (for-app @records))) 5000)
              (let [[insert-rec update-rec delete-rec] (vec (for-app @records))]
                (testing "create"
                  (let [hook {:id_attr_ids [id-aid]
                              :actions ["create"]}]
                    (testing "matches insert that touched id-aid"
                      (is (boolean (webhook/webhook-matches? insert-rec hook))))
                    (testing "does not match update wal"
                      (is (nil? (webhook/webhook-matches? update-rec hook))))
                    (testing "does not match delete wal"
                      (is (nil? (webhook/webhook-matches? delete-rec hook)))))
                  (testing "does not match insert when id_attr_ids excludes touched attrs"
                    (is (nil? (webhook/webhook-matches?
                               insert-rec
                               {:id_attr_ids [other-aid]
                                :actions ["create"]})))))

                (testing "update"
                  (let [hook {:id_attr_ids [name-aid]
                              :actions ["update"]}]
                    (testing "matches update that touched name-aid"
                      (is (boolean (webhook/webhook-matches? update-rec hook))))
                    (testing "does not match insert wal"
                      (is (nil? (webhook/webhook-matches? insert-rec hook))))
                    (testing "does not match delete wal"
                      (is (nil? (webhook/webhook-matches? delete-rec hook)))))
                  (testing "does not match update when id_attr_ids excludes touched attrs"
                    (is (nil? (webhook/webhook-matches?
                               update-rec
                               {:id_attr_ids [other-aid]
                                :actions ["update"]}))))
                  (testing "does not match update when id_attr_ids only references untouched attrs"
                    ;; tx 2 only updated name-aid; id-aid wasn't part of the update.
                    (is (nil? (webhook/webhook-matches?
                               update-rec
                               {:id_attr_ids [id-aid]
                                :actions ["update"]})))))

                (testing "delete"
                  (let [hook {:id_attr_ids [id-aid]
                              :actions ["delete"]}]
                    (testing "matches delete that touched id-aid"
                      (is (boolean (webhook/webhook-matches? delete-rec hook))))
                    (testing "does not match insert wal"
                      (is (nil? (webhook/webhook-matches? insert-rec hook))))
                    (testing "does not match update wal"
                      (is (nil? (webhook/webhook-matches? update-rec hook)))))
                  (testing "does not match delete when id_attr_ids excludes touched attrs"
                    (is (nil? (webhook/webhook-matches?
                               delete-rec
                               {:id_attr_ids [other-aid]
                                :actions ["delete"]})))))

                (testing "webhook-data-for-wal-record"
                  (let [hook {:etypes ["users"]
                              :actions ["create" "update" "delete"]}]
                    (testing "insert produces a create record"
                      (let [data (webhook/webhook-data-for-wal-record hook insert-rec)]
                        (is (= 1 (count data)))
                        (let [{:keys [etype action id before after]} (first data)]
                          (is (= "users" etype))
                          (is (= "create" action))
                          (is (= user-id id))
                          (is (nil? before))
                          (is (= {"id" (str user-id) "name" "alice"} after)))))
                    (testing "update produces an update record"
                      (let [data (webhook/webhook-data-for-wal-record hook update-rec)]
                        (is (= 1 (count data)))
                        (let [{:keys [etype action id before after]} (first data)]
                          (is (= "users" etype))
                          (is (= "update" action))
                          (is (= user-id id))
                          (is (= {"id" (str user-id) "name" "alice"} before))
                          (is (= {"id" (str user-id) "name" "bob"} after)))))
                    (testing "delete produces a delete record"
                      (let [data (webhook/webhook-data-for-wal-record hook delete-rec)]
                        (is (= 1 (count data)))
                        (let [{:keys [etype action id before after]} (first data)]
                          (is (= "users" etype))
                          (is (= "delete" action))
                          (is (= user-id id))
                          (is (= {"id" (str user-id) "name" "bob"} before))
                          (is (nil? after))))))
                  (testing "non-matching etype returns no records"
                    (let [hook {:etypes ["books"]
                                :actions ["create" "update" "delete"]}]
                      (is (empty? (webhook/webhook-data-for-wal-record hook insert-rec)))
                      (is (empty? (webhook/webhook-data-for-wal-record hook update-rec)))
                      (is (empty? (webhook/webhook-data-for-wal-record hook delete-rec)))))
                  (testing "non-matching action returns no records"
                    (let [hook {:etypes ["users"]
                                :actions ["delete"]}]
                      (is (empty? (webhook/webhook-data-for-wal-record hook insert-rec)))
                      (is (empty? (webhook/webhook-data-for-wal-record hook update-rec))))))))))))))

;; We don't support links yet
(deftest webhook-matches?-doesn't-match-for-links
  (with-empty-app
    (fn [app]
      (let [attr->id (test-util/make-attrs (:id app)
                                           [[:users/id :unique? :index?]
                                            [:books/id :unique? :index?]
                                            [[:users/favorite :books/favoritedBy] :unique?]])
            attrs (attr-model/get-by-app-id (:id app))
            users-id-aid (:users/id attr->id)
            books-id-aid (:books/id attr->id)
            ref-aid (:users/favorite attr->id)
            u1 (test-util/stuid "u")
            b1 (test-util/stuid "b")
            b2 (test-util/stuid "ba")
            for-app (fn [recs] (filter #(= (:id app) (:app-id %)) recs))
            enable-wal-entity-log? (var-get #'flags/enable-wal-entity-log?)]
        (with-redefs [flags/enable-wal-entity-log?
                      (fn [aid]
                        (or (= aid (:id app)) (enable-wal-entity-log? aid)))
                      flags/log-to-wal-log-table?
                      (constantly true)]
          (test-util/with-test-replication-slot [records]
            ;; Tx 1: setup users + books
            (tx/transact! (aurora/conn-pool :write) attrs (:id app)
                          [[:add-triple u1 users-id-aid (str u1)]
                           [:add-triple b1 books-id-aid (str b1)]
                           [:add-triple b2 books-id-aid (str b2)]])
            ;; Tx 2: add link u1.favorite = b1
            (tx/transact! (aurora/conn-pool :write) attrs (:id app)
                          [[:add-triple u1 ref-aid (str b1)]])
            ;; Tx 3: change link to b2
            (tx/transact! (aurora/conn-pool :write) attrs (:id app)
                          [[:add-triple u1 ref-aid (str b2)]])
            ;; Tx 4: remove link
            (tx/transact! (aurora/conn-pool :write) attrs (:id app)
                          [[:retract-triple u1 ref-aid (str b2)]])
            (test-util/wait-for #(<= 4 (count (for-app @records))) 5000)
            (let [[_setup add-link change-link remove-link] (vec (for-app @records))]
              (testing "add link doesn't trigger"
                (testing "users-side"
                  (is (not (boolean (webhook/webhook-matches?
                                     add-link
                                     {:id_attr_ids [users-id-aid]
                                      :actions ["create" "update"]})))))
                (testing "books-side"
                  (is (not (boolean (webhook/webhook-matches?
                                     add-link
                                     {:id_attr_ids [books-id-aid]
                                      :actions ["create" "update"]}))))))

              (testing "change link doesn't trigger"
                (testing "users-side"
                  (is (not (boolean (webhook/webhook-matches?
                                     change-link
                                     {:id_attr_ids [users-id-aid]
                                      :actions ["update"]})))))
                (testing "books-side"
                  (is (not (boolean (webhook/webhook-matches?
                                     change-link
                                     {:id_attr_ids [books-id-aid]
                                      :actions ["update"]}))))))

              (testing "remove link doesn't trigger"
                (testing "users-side"
                  (is (not (boolean (webhook/webhook-matches?
                                     remove-link
                                     {:id_attr_ids [users-id-aid]
                                      :actions ["update" "delete"]})))))
                (testing "books-side"
                  (is (not (boolean (webhook/webhook-matches?
                                     remove-link
                                     {:id_attr_ids [books-id-aid]
                                      :actions ["update" "delete"]})))))))))))))

(deftest create-events!-finds-wal-record-by-isn
  (with-empty-app
    (fn [app]
      (let [attrs (test-util/make-attrs (:id app) [[:users/id :unique? :index?]
                                                   [:users/name]])
            id-aid (:users/id attrs)
            name-aid (:users/name attrs)
            user-id (test-util/stuid "ua")
            webhook-id (random-uuid)
            wal-records [(make-wal-record
                          {:app-id (:id app)
                           :isn (isn/test-isn 700)
                           :previous-isn (isn/test-isn 699)
                           :triple-changes [(triple-insert (:id app) user-id name-aid "alice")]})
                         (make-wal-record
                          {:app-id (:id app)
                           :isn (isn/test-isn 701)
                           :previous-isn (isn/test-isn 700)
                           :triple-changes [(triple-insert (:id app) user-id id-aid (str user-id))]})
                         (make-wal-record
                          {:app-id (:id app)
                           :isn (isn/test-isn 702)
                           :previous-isn (isn/test-isn 701)
                           :triple-changes [(triple-insert (:id app) user-id name-aid "bob")]})]
            target-wr (nth wal-records 1)
            match {:webhook_id webhook-id
                   :id_attr_ids #{id-aid}
                   :actions ["create"]
                   :isn (:isn target-wr)}
            expected-bucket (history/partition-bucket-of-wal-record target-wr)]
        (insert-webhook! {:app-id (:id app)
                          :webhook-id webhook-id
                          :id-attr-ids [id-aid]
                          :actions ["create"]})
        (try
          (let [result (webhook/create-events! wal-records [match])]
            (is (= 1 (count result))
                "create-events! must look up the middle wal-record by isn")
            (let [event (first result)]
              (is (= (:isn target-wr) (:isn event)))
              (is (= webhook-id (:webhook_id event)))
              (is (= expected-bucket (:partition_bucket event)))))
          (finally
            (sql/do-execute! (aurora/conn-pool :write)
                             ["delete from webhook_events where webhook_id = ?" webhook-id])))))))
