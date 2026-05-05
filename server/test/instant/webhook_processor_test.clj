(ns instant.webhook-processor-test
  (:require
   [clojure.test :refer [deftest is]]
   [instant.config :as config]
   [instant.fixtures :refer [with-empty-app]]
   [instant.isn :as isn]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.model.history :as history]
   [instant.util.test :as test-util]
   [instant.webhook-processor :as webhook-processor])
  (:import
   (java.time Instant)))

(deftest handle-event!-records-failed-attempt-for-disabled-webhook
  (with-empty-app
    (fn [app]
      (let [attrs (test-util/make-attrs (:id app) [[:users/id :unique? :index?]])
            id-aid (:users/id attrs)
            webhook-id (random-uuid)
            isn (isn/test-isn 1)
            partition-bucket (history/partition-bucket-for-time (Instant/now))]
        (sql/do-execute! (aurora/conn-pool :write)
                         ["insert into webhooks
                            (id, app_id, topics, id_attr_ids, actions, sink, status)
                            values (?, ?, 0, ?, ?, ?::jsonb, 'disabled'::webhook_status)"
                          webhook-id (:id app)
                          (with-meta [id-aid] {:pgtype "uuid[]"})
                          (with-meta ["create"] {:pgtype "webhook_action[]"})
                          "{\"url\": \"https://example.com/hook\"}"])
        (sql/do-execute! (aurora/conn-pool :write)
                         ["insert into webhook_events
                            (webhook_id, isn, app_id, status, machine_id, partition_bucket)
                            values (?, ?, ?, 'processing'::webhook_event_status, ?, ?)"
                          webhook-id isn (:id app) config/machine-id partition-bucket])
        (try
          (webhook-processor/handle-event! {:webhook_id webhook-id
                                            :isn isn
                                            :app_id (:id app)
                                            :partition_bucket partition-bucket
                                            :attempt_count 0}
                                           (Instant/now))
          (let [{:keys [status attempts]}
                (sql/select-one (aurora/conn-pool :read)
                                ["select status, attempts from webhook_events
                                   where webhook_id = ? and isn = ? and partition_bucket = ?"
                                 webhook-id isn partition-bucket])
                attempt (first attempts)]
            (is (= "failed" status)
                "claim is cleared so free-stuck-events! won't recycle the row")
            (is (= 1 (count attempts)))
            (is (false? (:success? attempt)))
            (is (= "disabled" (:error-type attempt)))
            (is (= "Webhook is disabled." (:error-message attempt))))
          (finally
            (sql/do-execute! (aurora/conn-pool :write)
                             ["delete from webhook_events
                                where webhook_id = ? and isn = ? and partition_bucket = ?"
                              webhook-id isn partition-bucket])))))))
