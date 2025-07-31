Phase 1: Database Schema Changes

1.1 Add deletion_marked_at column

-- Migration file: XX_add_attr_soft_delete.up.sql
ALTER TABLE attrs ADD COLUMN deletion_marked_at TIMESTAMP;

-- Create index for efficient sweeper queries
CREATE INDEX attrs_deletion_marked_at ON attrs(deletion_marked_at)
WHERE deletion_marked_at IS NOT NULL;

1.2 Create active_attrs view

CREATE VIEW active_attrs AS
SELECT \* FROM attrs
WHERE deletion_marked_at IS NULL;

-- Recreate all existing indexes on the view for performance
CREATE INDEX active_attrs_app_id ON active_attrs (app_id);
CREATE INDEX active_attrs_forward_ident ON active_attrs (forward_ident);
CREATE INDEX active_attrs_reverse_ident ON active_attrs (reverse_ident);

1.3 Handle CASCADE relationships

Since idents and triples have CASCADE DELETE on attr_id, we need to handle
soft-deletes:

-- Add deletion_marked_at to idents
ALTER TABLE idents ADD COLUMN deletion_marked_at TIMESTAMP;
CREATE INDEX idents_deletion_marked_at ON idents(deletion_marked_at)
WHERE deletion_marked_at IS NOT NULL;

-- Add deletion_marked_at to triples
ALTER TABLE triples ADD COLUMN deletion_marked_at TIMESTAMP;
CREATE INDEX triples_deletion_marked_at ON triples(deletion_marked_at)
WHERE deletion_marked_at IS NOT NULL;

-- Create trigger to cascade soft-deletes
CREATE OR REPLACE FUNCTION cascade_attr_soft_delete() RETURNS TRIGGER AS $$
BEGIN
-- When attr is soft-deleted, soft-delete related idents
UPDATE idents
SET deletion_marked_at = NEW.deletion_marked_at
WHERE attr_id = NEW.id AND deletion_marked_at IS NULL;

      -- When attr is soft-deleted, soft-delete related triples
      UPDATE triples
      SET deletion_marked_at = NEW.deletion_marked_at
      WHERE attr_id = NEW.id AND deletion_marked_at IS NULL;

      RETURN NEW;

END;

$$
LANGUAGE plpgsql;

  CREATE TRIGGER attr_soft_delete_cascade
AFTER UPDATE OF deletion_marked_at ON attrs
FOR EACH ROW
WHEN (OLD.deletion_marked_at IS NULL AND NEW.deletion_marked_at IS NOT NULL)
EXECUTE FUNCTION cascade_attr_soft_delete();

  -- Create views for active idents and triples
CREATE VIEW active_idents AS
SELECT * FROM idents
WHERE deletion_marked_at IS NULL;

  CREATE VIEW active_triples AS
SELECT * FROM triples
WHERE deletion_marked_at IS NULL;

  Phase 2: Update Clojure Models

  2.1 Update attr-model namespace

  ;; src/instant/db/model/attr.clj

  ;; Change delete-multi! to soft-delete
(defn delete-multi!
  "Soft-deletes a batch of attrs for an app by setting deletion_marked_at"
  [conn app-id ids]
  (with-cache-invalidation app-id
    (sql/do-execute!
     ::delete-multi!
     conn
     (hsql/format
      {:update :attrs
       :set {:deletion_marked_at [:now]}
       :where [[:and
                [:= :app-id app-id]
                [:in :id ids]
                [:= :deletion_marked_at nil]]]}))))

  ;; Add hard-delete for sweeper
(defn hard-delete-multi!
  "Permanently deletes attrs. Used by deletion sweeper only."
  [conn app-id ids]
  (with-cache-invalidation app-id
    (sql/do-execute!
     ::hard-delete-multi!
     conn
     (hsql/format
      {:delete-from :attrs
       :where [[:and
                [:= :app-id app-id]
                [:in :id ids]]]}))))

  ;; Update all queries to use active_attrs view
(defn get-by-app-id
  [conn app-id]
  (sql/select
   ::get-by-app-id
   conn
   (hsql/format
    {:select [:*]
     :from [:active_attrs]  ; Changed from :attrs
     :where [:= :app-id app-id]})))

  ;; Add restore function
(defn restore-multi!
  "Restores soft-deleted attrs"
  [conn app-id ids]
  (with-cache-invalidation app-id
    (sql/do-execute!
     ::restore-multi!
     conn
     (hsql/format
      {:update :attrs
       :set {:deletion_marked_at nil
             :required false
             :indexed false}
       :where [[:and
                [:= :app-id app-id]
                [:in :id ids]
                [:<> :deletion_marked_at nil]]]}))))

  2.2 Update ident-model namespace

  ;; src/instant/db/model/ident.clj

  ;; Update all queries to use active_idents view
(defn get-by-attr-id
  [conn attr-id]
  (sql/select
   ::get-by-attr-id
   conn
   (hsql/format
    {:select [:*]
     :from [:active_idents]  ; Changed from :idents
     :where [:= :attr-id attr-id]})))

  2.3 Update triple-model namespace

  ;; src/instant/db/model/triple.clj

  ;; Update queries to use active_triples view
;; This is critical for query performance

  Phase 3: Update Transaction Processing

  3.1 Ensure delete-attr uses soft-delete

  ;; src/instant/db/transaction.clj
;; No changes needed - already calls attr-model/delete-multi!

  Phase 4: Update Invalidator

  4.1 Handle soft-delete as UPDATE

  ;; src/instant/reactive/invalidator.clj

  ;; The existing code already handles this correctly:
;; - topics-for-attr-change handles :update action
;; - This will invalidate all necessary queries
;; No changes needed!

  Phase 5: Update Sweeper

  5.1 Rename and extend app_deletion_sweeper

  ;; Rename src/instant/app_deletion_sweeper.clj to
src/instant/deletion_sweeper.clj

  (ns instant.deletion-sweeper
  ;; ... existing requires ...
  (:require
   [instant.db.model.attr :as attr-model]))

  ;; Add attr deletion
(defn get-attrs-to-delete
  [conn maximum-marked-date]
  (sql/select
   ::get-attrs-to-delete
   conn
   ["SELECT id, app_id FROM attrs
     WHERE deletion_marked_at IS NOT NULL
     AND deletion_marked_at <= ?"
    maximum-marked-date]))

  (defn delete-attrs-batch!
  "Deletes attrs in batches to avoid timeouts"
  [conn attrs-by-app batch-size]
  (doseq [[app-id attr-ids] attrs-by-app]
    (doseq [batch (partition-all batch-size attr-ids)]
      (try
        (binding [sql/*query-timeout-seconds* delete-timeout-seconds]
          (attr-model/hard-delete-multi! conn app-id batch))
        (catch Throwable e
          (tracer/add-exception! e {:escaping? false
                                   :app-id app-id
                                   :batch-size (count batch)}))))))

  (defn handle-sweep [_]
  (tracer/with-span! {:name "deletion-sweeper/sweep"}
    (when-not (flags/deletion-sweeper-disabled?)
      (let [maximum-marked-date (-> (date-util/pst-now)
                                   (.minus (Duration/ofDays
grace-period-days)))]

          ;; First, delete old attrs (this cascades to idents/triples)
        (let [attrs-to-delete (get-attrs-to-delete
                              (aurora/conn-pool :read)
                              (.toInstant maximum-marked-date))
              attrs-by-app (group-by :app_id attrs-to-delete)]
          (tracer/add-data! {:attributes {:attr-count (count
attrs-to-delete)}})
          (delete-attrs-batch! (aurora/conn-pool :write)
                              (update-vals attrs-by-app #(map :id %))
                              100)) ; batch size

          ;; Then, delete apps as before
        (let [apps-to-delete (app-model/get-apps-to-delete
                             {:maximum-deletion-marked-at
                              (.toInstant maximum-marked-date)})]
          (tracer/add-data! {:attributes {:app-count (count apps-to-delete)}})
          (doseq [{:keys [id] :as app} apps-to-delete]
            (grab/run-once!
             (format "delete-app-%s-%s" id (date-util/numeric-date-str
maximum-marked-date))
             (fn [] (straight-jacket-delete-app! app)))))))))

  5.2 Update flags

  ;; Update flag name from app-deletion-sweeper-disabled to
deletion-sweeper-disabled

  Phase 6: Admin Tools for Restoration

  6.1 Create admin endpoints

  ;; src/instant/admin/routes.clj

  (defn restore-attr-handler
  [{:keys [params] :as req}]
  (let [{:keys [app-id attr-ids]} params]
    (attr-model/restore-multi!
     (aurora/conn-pool :write)
     app-id
     attr-ids)
    {:status 200
     :body {:restored (count attr-ids)}}))

  ;; Add route
(defroutes admin-routes
  ;; ... existing routes ...
  (POST "/admin/restore-attrs" [] restore-attr-handler))

  Phase 7: Testing

  7.1 Add tests for soft-delete

  ;; test/instant/db/model/attr_test.clj

  (deftest test-soft-delete
  (testing "delete-multi! sets deletion_marked_at"
    ;; Test that attrs are soft-deleted
    ;; Test that idents cascade soft-delete
    ;; Test that triples cascade soft-delete
    ;; Test that queries don't return soft-deleted attrs))

  (deftest test-restore
  (testing "restore-multi! clears deletion_marked_at"
    ;; Test restoration of attrs
    ;; Test cascade restoration))

  7.2 Test invalidation

  ;; test/instant/reactive/invalidator_test.clj

  (deftest test-soft-delete-invalidation
  (testing "soft-delete triggers proper invalidation"
    ;; Test that soft-delete invalidates queries
    ;; Test that restored attrs invalidate queries))

  Phase 8: Migration Strategy

  8.1 Deployment steps

  1. Deploy database migrations
2. Deploy code changes with feature flag disabled
3. Enable soft-delete via feature flag
4. Monitor performance and errors
5. Remove feature flag after validation

  8.2 Rollback plan

  1. Disable feature flag
2. Run UPDATE to clear all deletion_marked_at
3. Deploy previous code version
4. Drop new columns and views

  Phase 9: Monitoring

  9.1 Add metrics

  ;; Track soft-delete performance
(tracer/record-metric!
  {:name "attr.soft-delete"
   :value (count ids)
   :attributes {:app-id app-id}})

  ;; Track sweeper performance
(tracer/record-metric!
  {:name "deletion-sweeper.attrs-deleted"
   :value (count attrs-to-delete)})

  9.2 Add alerts

  - Alert if deletion_marked_at attrs > threshold
- Alert if sweeper fails repeatedly
- Alert if delete-attr operations timeout

  Performance Considerations

  1. Index usage: The active_attrs view will use existing indexes efficiently
2. Query plans: Test that JOIN queries still use proper indexes
3. Sweeper batching: Process attrs in batches to avoid long transactions
4. WAL size: Monitor WAL size as soft-deletes generate UPDATE records

  This plan provides a complete implementation path while maintaining backward
compatibility and system stability.
$$
