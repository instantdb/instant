(ns instant.custodian-test
  (:require
   [clojure.test :refer [deftest testing is use-fixtures]]
   [instant.config :as config]
   [instant.custodian :as custodian]
   [instant.db.model.attr :as attr-model]
   [instant.db.transaction :as tx]
   [instant.fixtures :refer [with-empty-app]]
   [instant.flags :as flags]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]))

;; core/start launches the custodian worker, so an ambient worker would race
;; these tests (claiming/draining the rows we enqueue). Stop it for the duration
;; and drive the logic directly, then restart it.
(use-fixtures :once
  (fn [f]
    (custodian/stop)
    (try
      (f)
      (finally
        (custodian/start)))))

;; ----------
;; Helpers

(defn custodian-rows [conn app-id]
  (sql/select ::custodian-rows
              conn
              ["select id, type, depends_on, worker_id
                  from custodian where app_id = ?::uuid order by created_at" app-id]))

(defn row-of-type [conn app-id type]
  (->> (custodian-rows conn app-id)
       (filter #(= type (:type %)))
       first))

(defn count-triples [conn app-id]
  (:count (sql/select-one ::count-triples conn
                          ["select count(*)::int as count from triples where app_id = ?::uuid" app-id])))

(defn count-transactions [conn app-id]
  (:count (sql/select-one ::count-transactions conn
                          ["select count(*)::int as count from transactions where app_id = ?::uuid" app-id])))

(defn count-apps [conn app-id]
  (:count (sql/select-one ::count-apps conn
                          ["select count(*)::int as count from apps where id = ?::uuid" app-id])))

(defn count-triples-for-attr [conn app-id attr-id]
  (:count (sql/select-one ::count-attr-triples conn
                          ["select count(*)::int as count from triples
                             where app_id = ?::uuid and attr_id = ?::uuid" app-id attr-id])))

(defn count-attr [conn app-id attr-id]
  (:count (sql/select-one ::count-attr conn
                          ["select count(*)::int as count from attrs
                             where app_id = ?::uuid and id = ?::uuid" app-id attr-id])))

(defn count-attrs [conn app-id]
  (:count (sql/select-one ::count-attrs conn
                          ["select count(*)::int as count from attrs where app_id = ?::uuid" app-id])))

(defn mark-app-for-deletion! [conn app-id]
  (sql/do-execute! ::mark-app conn
                   ["update apps set deletion_marked_at = now() where id = ?::uuid" app-id]))

(defn mark-attr-for-deletion! [conn app-id attr-id]
  (sql/do-execute! ::mark-attr conn
                   ["update attrs set deletion_marked_at = now()
                      where app_id = ?::uuid and id = ?::uuid" app-id attr-id]))

(defn seed-app!
  "Adds an attr and a handful of triples across two transactions, so there's
   something for custodian to delete. Returns the attr id."
  [app-id]
  (let [conn (aurora/conn-pool :write)
        attr-id (random-uuid)
        ident-id (random-uuid)]
    (tx/transact! conn
                  (attr-model/get-by-app-id app-id)
                  app-id
                  (into [[:add-attr {:id attr-id
                                     :forward-identity [ident-id "items" "label"]
                                     :value-type :blob :cardinality :one
                                     :unique? false :index? false}]]
                        (for [i (range 5)]
                          [:add-triple (random-uuid) attr-id (str "item-" i)])))
    (tx/transact! conn
                  (attr-model/get-by-app-id app-id)
                  app-id
                  [[:add-triple (random-uuid) attr-id "item-5"]])
    attr-id))

(defn add-attr-with-triples!
  "Adds one attr named `label` (on the `items` etype) with a few triples.
   Returns the attr id."
  [app-id label]
  (let [attr-id (random-uuid)
        ident-id (random-uuid)]
    (tx/transact! (aurora/conn-pool :write)
                  (attr-model/get-by-app-id app-id)
                  app-id
                  (into [[:add-attr {:id attr-id
                                     :forward-identity [ident-id "items" label]
                                     :value-type :blob :cardinality :one
                                     :unique? false :index? false}]]
                        (for [i (range 3)]
                          [:add-triple (random-uuid) attr-id (str label "-" i)])))
    attr-id))

(defn drain-all!
  "Runs the worker's tick! until there's no runnable work left."
  [conn]
  (let [stop? (atom false)
        backing-off? (atom false)]
    (loop []
      (when (custodian/tick! stop? backing-off? conn)
        (recur)))))

;; ----------
;; Enqueue

(deftest enqueue-app-builds-the-chain
  (with-empty-app
    (fn [app]
      (let [app-id (:id app)
            conn (aurora/conn-pool :write)]
        (custodian/enqueue-app-deletion! conn {:app-id app-id})
        (let [triples (row-of-type conn app-id "triples")
              transactions (row-of-type conn app-id "transactions")
              attrs (row-of-type conn app-id "attrs")
              app-row (row-of-type conn app-id "app")]
          (testing "one row per step, all unowned"
            (is (= 4 (count (custodian-rows conn app-id))))
            (is (every? (comp nil? :worker_id) [triples transactions attrs app-row])))
          (testing "chain is triples <- transactions <- attrs <- app"
            (is (nil? (:depends_on triples)))
            (is (= (:id triples) (:depends_on transactions)))
            (is (= (:id transactions) (:depends_on attrs)))
            (is (= (:id attrs) (:depends_on app-row)))))
        (testing "re-enqueuing an in-flight plan is an idempotent no-op"
          (custodian/enqueue-app-deletion! conn {:app-id app-id})
          (is (= 4 (count (custodian-rows conn app-id)))))))))

(deftest enqueue-attr-builds-the-chain
  (with-empty-app
    (fn [app]
      (let [app-id (:id app)
            conn (aurora/conn-pool :write)
            attr-id (seed-app! app-id)]
        (custodian/enqueue-attr-deletion! conn {:app-id app-id :attr-id attr-id})
        (let [triples (row-of-type conn app-id "triples")
              attr-row (row-of-type conn app-id "attr")]
          (is (= 2 (count (custodian-rows conn app-id))))
          (testing "chain is triples <- attr, both scoped to the attr"
            (is (nil? (:depends_on triples)))
            (is (= (:id triples) (:depends_on attr-row)))))))))

;; ----------
;; Claim

(deftest claim-takes-the-runnable-row-and-owns-it
  (with-empty-app
    (fn [app]
      (let [app-id (:id app)
            conn (aurora/conn-pool :write)]
        (custodian/enqueue-app-deletion! conn {:app-id app-id})
        (let [claimed (custodian/claim-row! conn)]
          (testing "triples runs first (depends_on is null) and gets owned"
            (is (= "triples" (:type claimed)))
            (is (= @config/process-id (:worker_id claimed))))
          (testing "nothing else is runnable yet: dependents blocked, triples owned"
            (is (nil? (custodian/claim-row! conn)))))))))

;; ----------
;; End-to-end

(deftest drains-triples-transactions-and-the-app
  (with-empty-app
    (fn [app]
      (let [app-id (:id app)
            conn (aurora/conn-pool :write)]
        (seed-app! app-id)
        (mark-app-for-deletion! conn app-id)
        (is (pos? (count-triples conn app-id)))
        (is (pos? (count-transactions conn app-id)))
        (is (pos? (count-attrs conn app-id)))
        (custodian/enqueue-app-deletion! conn {:app-id app-id})
        ;; small batch size so the drain loops over several committed batches
        (binding [flags/*flag-overrides* {:custodian-batch-size 2}]
          (drain-all! conn))
        (testing "everything is gone"
          (is (zero? (count-triples conn app-id)))
          (is (zero? (count-transactions conn app-id)))
          (is (zero? (count-attrs conn app-id)))
          (is (zero? (count-apps conn app-id)))
          (is (empty? (custodian-rows conn app-id))))))))

(deftest attrs-step-deletes-every-attr-and-leaves-the-app
  (with-empty-app
    (fn [app]
      (let [app-id (:id app)
            conn (aurora/conn-pool :write)]
        (add-attr-with-triples! app-id "a")
        (add-attr-with-triples! app-id "b")
        (mark-app-for-deletion! conn app-id)
        (is (pos? (count-attrs conn app-id)))
        ;; the attrs step on its own (what the app chain runs before the app delete)
        (sql/do-execute! ::insert-attrs-step conn
                         ["insert into custodian (app_id, type) values (?::uuid, 'attrs')" app-id])
        (binding [flags/*flag-overrides* {:custodian-attr-batch-size 1}]
          (drain-all! conn))
        (testing "every attr (and its triples) is gone, the app itself survives"
          (is (zero? (count-attrs conn app-id)))
          (is (zero? (count-triples conn app-id)))
          (is (= 1 (count-apps conn app-id)))
          (is (empty? (custodian-rows conn app-id))))))))

(deftest attr-deletion-deletes-only-the-target-attr
  (with-empty-app
    (fn [app]
      (let [app-id (:id app)
            conn (aurora/conn-pool :write)
            attr-a (add-attr-with-triples! app-id "a")
            attr-b (add-attr-with-triples! app-id "b")]
        (mark-attr-for-deletion! conn app-id attr-a)
        (is (pos? (count-triples-for-attr conn app-id attr-a)))
        (is (pos? (count-triples-for-attr conn app-id attr-b)))
        (custodian/enqueue-attr-deletion! conn {:app-id app-id :attr-id attr-a})
        (binding [flags/*flag-overrides* {:custodian-batch-size 2}]
          (drain-all! conn))
        (testing "the target attr and only its triples are gone"
          (is (zero? (count-triples-for-attr conn app-id attr-a)))
          (is (zero? (count-attr conn app-id attr-a))))
        (testing "the other attr, its triples, the transactions, and the app all survive"
          (is (pos? (count-triples-for-attr conn app-id attr-b)))
          (is (pos? (count-attr conn app-id attr-b)))
          (is (pos? (count-transactions conn app-id)))
          (is (pos? (count-apps conn app-id))))
        (testing "the plan is cleaned up"
          (is (empty? (custodian-rows conn app-id))))))))

;; ----------
;; Marked-for-deletion guard

(deftest an-unmarked-app-is-left-alone
  (with-empty-app
    (fn [app]
      (let [app-id (:id app)
            conn (aurora/conn-pool :write)]
        (seed-app! app-id) ;; deliberately NOT marked for deletion
        (custodian/enqueue-app-deletion! conn {:app-id app-id})
        (let [row (custodian/claim-row! conn)]
          ;; processing catches the not-marked guard, tears down the plan, and logs
          (#'custodian/process-row! (atom false) (atom false) conn row)
          (testing "nothing is deleted"
            (is (pos? (count-triples conn app-id)))
            (is (pos? (count-transactions conn app-id)))
            (is (pos? (count-apps conn app-id))))
          (testing "the deletion plan is torn down"
            (is (empty? (custodian-rows conn app-id)))))))))

(deftest an-unmarked-attr-is-left-alone
  (with-empty-app
    (fn [app]
      (let [app-id (:id app)
            conn (aurora/conn-pool :write)
            attr-id (seed-app! app-id)] ;; attr deliberately NOT marked for deletion
        (custodian/enqueue-attr-deletion! conn {:app-id app-id :attr-id attr-id})
        (let [row (custodian/claim-row! conn)]
          ;; processing catches the not-marked guard, tears down the plan, and logs
          (#'custodian/process-row! (atom false) (atom false) conn row)
          (testing "the attr and its triples survive"
            (is (pos? (count-triples-for-attr conn app-id attr-id)))
            (is (pos? (count-attr conn app-id attr-id))))
          (testing "the deletion plan is torn down"
            (is (empty? (custodian-rows conn app-id)))))))))

;; ----------
;; Stop

(deftest stopping-mid-drain-releases-the-row-and-keeps-progress
  (with-empty-app
    (fn [app]
      (let [app-id (:id app)
            conn (aurora/conn-pool :write)]
        (seed-app! app-id)
        (mark-app-for-deletion! conn app-id)
        (let [total (count-triples conn app-id)]
          (is (> total 1))
          (custodian/enqueue-app-deletion! conn {:app-id app-id})
          (let [row (custodian/claim-row! conn)
                ;; drain! reads @stop? once per batch: false on the first check
                ;; (do one batch), true on the second (stop before the next).
                checks (atom 0)
                stop? (reify clojure.lang.IDeref
                        (deref [_] (> (swap! checks inc) 1)))]
            (is (= "triples" (:type row)))
            (binding [flags/*flag-overrides* {:custodian-batch-size 1}]
              (#'custodian/process-row! stop? (atom false) conn row))
            (testing "one batch ran, then it stopped"
              (is (= (dec total) (count-triples conn app-id))))
            (testing "the row is released (not finished) so it can be reclaimed"
              (let [triples-row (row-of-type conn app-id "triples")]
                (is (some? triples-row))
                (is (nil? (:worker_id triples-row)))))
            (testing "a fresh worker reclaims it and finishes the deletion"
              (drain-all! conn)
              (is (zero? (count-triples conn app-id)))
              (is (zero? (count-apps conn app-id))))))))))

;; ----------
;; Ownership / reaper

(deftest reaper-frees-rows-with-a-stale-owner
  (with-empty-app
    (fn [app]
      (let [app-id (:id app)
            conn (aurora/conn-pool :write)]
        ;; Seed a row owned by a worker that stopped heartbeating. We INSERT it
        ;; with an old updated_at directly: a normal UPDATE would fire the
        ;; update_updated_at trigger and reset it to now (which is exactly why a
        ;; live worker's row never looks stale, and a dead one's does).
        (sql/do-execute! ::insert-stuck conn
                         ["insert into custodian (app_id, type, status, worker_id, updated_at)
                            values (?::uuid, 'triples', 'working', 'stuck-worker', now() - interval '10 minutes')" app-id])
        (custodian/reap-stuck! conn)
        (is (nil? (:worker_id (row-of-type conn app-id "triples")))
            "a stale owner is cleared so the row can be reclaimed")))))

(deftest reaper-deletes-a-long-failed-job-and-its-dependents
  (with-empty-app
    (fn [app]
      (let [app-id (:id app)
            conn (aurora/conn-pool :write)
            root (random-uuid)
            dep (random-uuid)]
        ;; A failed root two days old, plus a dependent still waiting on it. INSERT
        ;; the old updated_at directly (an UPDATE would fire the update_updated_at
        ;; trigger). The dependent's own updated_at is now: it's not itself failed,
        ;; but it must go too so `depends_on`'s SET NULL can't make it runnable.
        (sql/do-execute! ::insert-failed conn
                         ["insert into custodian (id, app_id, type, status, updated_at)
                            values (?::uuid, ?::uuid, 'triples', 'failed', now() - interval '2 days')" root app-id])
        (sql/do-execute! ::insert-dep conn
                         ["insert into custodian (id, app_id, type, depends_on)
                            values (?::uuid, ?::uuid, 'transactions', ?::uuid)" dep app-id root])
        (is (= 2 (count (custodian-rows conn app-id))))
        (custodian/reap-failed! conn)
        (testing "the whole job is gone: the failed row and its dependent"
          (is (empty? (custodian-rows conn app-id))))
        (testing "a plan that failed recently is left alone"
          (sql/do-execute! ::insert-recent conn
                           ["insert into custodian (app_id, type, status, updated_at)
                              values (?::uuid, 'triples', 'failed', now())" app-id])
          (custodian/reap-failed! conn)
          (is (= 1 (count (custodian-rows conn app-id)))))))))

(deftest drain-throws-if-we-no-longer-own-the-row
  (with-empty-app
    (fn [app]
      (let [app-id (:id app)
            conn (aurora/conn-pool :write)]
        (seed-app! app-id)
        (mark-app-for-deletion! conn app-id)
        (custodian/enqueue-app-deletion! conn {:app-id app-id})
        (let [row (custodian/claim-row! conn)]
          ;; another worker takes it over
          (sql/do-execute! ::steal conn
                           ["update custodian set worker_id = 'someone-else' where id = ?::uuid" (:id row)])
          ;; the heartbeat's ownership guard raises, unwinding the drain. (process-row!
          ;; deliberately swallows this to fail the job, so we test drain! directly.)
          (is (thrown? Exception
                       (#'custodian/drain! ::drain (atom false) (atom false) conn (:id row)
                                           custodian/delete-app-triples-q {:app-id app-id}))))))))

;; ----------
;; Backpressure

(deftest sample-lag-sets-backing-off-against-the-threshold
  (testing "over the 100mb default -> back off"
    (let [backing-off? (atom false)]
      (with-redefs [custodian/max-replication-lag-bytes (fn [_] (* 200 1024 1024))]
        (custodian/sample-lag! backing-off?))
      (is (true? @backing-off?))))
  (testing "under the threshold -> don't back off"
    (let [backing-off? (atom true)]
      (with-redefs [custodian/max-replication-lag-bytes (fn [_] 0)]
        (custodian/sample-lag! backing-off?))
      (is (false? @backing-off?)))))
