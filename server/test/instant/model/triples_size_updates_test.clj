(ns instant.model.triples-size-updates-test
  (:require
   [clojure.test :as test :refer [deftest is testing]]
   [instant.db.model.attr :as attr-model]
   [instant.db.transaction :as tx]
   [instant.fixtures :refer [with-empty-app]]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.model.triples-size-updates :as tsu]))

(defn queue-rows [app-id]
  (sql/select (aurora/conn-pool :read)
              ["select attr_id, pg_size from triples_size_updates
                where app_id = ?::uuid order by id" app-id]))

(defn aggregate-by-attr [app-id]
  (->> (sql/select (aurora/conn-pool :read)
                   ["select attr_id, pg_size from triples_size_aggregate
                     where app_id = ?::uuid" app-id])
       (reduce (fn [m {:keys [attr_id pg_size]}]
                 (assoc m attr_id pg_size))
               {})))

(defn actual-sizes-by-attr
  "Computes SUM(pg_column_size(t)) per attr_id directly from the
   triples table. This is the ground truth the aggregate should match."
  [app-id]
  (->> (sql/select (aurora/conn-pool :read)
                   ["select attr_id, sum(pg_column_size(t))::bigint as pg_size
                     from triples t where app_id = ?::uuid group by attr_id" app-id])
       (reduce (fn [m {:keys [attr_id pg_size]}]
                 (assoc m attr_id pg_size))
               {})))

(defn assert-aggregate-matches-actual! [app-id]
  ;; A (app_id, attr_id) row in triples_size_aggregate persists with
  ;; pg_size=0 after all its triples are deleted — actual-sizes-by-attr
  ;; doesn't return those at all. Treat 0-valued aggregate rows as
  ;; equivalent to absent.
  (is (= (actual-sizes-by-attr app-id)
         (into {} (remove (fn [[_ v]] (zero? v)))
               (aggregate-by-attr app-id)))))

(defn drain! []
  (tsu/collect-batches! 1000000))

(defn make-blob-attr [etype label]
  {:id (random-uuid)
   :forward-identity [(random-uuid) etype label]
   :unique? false
   :index? false
   :value-type :blob
   :cardinality :one})

(defn add-attrs! [app attrs]
  (tx/transact! (aurora/conn-pool :write)
                (attr-model/get-by-app-id (:id app))
                (:id app)
                (mapv (fn [a] [:add-attr a]) attrs)))

(defn transact! [app ops]
  (tx/transact! (aurora/conn-pool :write)
                (attr-model/get-by-app-id (:id app))
                (:id app)
                ops))

(deftest insert-emits-positive-rows-and-collect-aggregates
  (with-empty-app
    (fn [app]
      (let [name-attr (make-blob-attr "users" "name")
            age-attr  (make-blob-attr "users" "age")
            eid       (random-uuid)]
        (add-attrs! app [name-attr age-attr])
        (drain!) ;; flush anything from app/attr creation

        (transact! app
                   [[:add-triple eid (:id name-attr) "Alice"]
                    [:add-triple eid (:id age-attr) 42]])

        (testing "queue has a positive row per attr touched"
          (let [rows (queue-rows (:id app))
                by-attr (group-by :attr_id rows)]
            (is (= #{(:id name-attr) (:id age-attr)}
                   (set (keys by-attr))))
            (is (every? #(pos? (:pg_size %)) rows))))

        (testing "collect drains the queue"
          (drain!)
          (is (empty? (queue-rows (:id app)))))

        (testing "aggregate matches SUM(pg_column_size) per attr"
          (assert-aggregate-matches-actual! (:id app)))))))

(deftest update-emits-delta-and-aggregate-stays-correct
  (with-empty-app
    (fn [app]
      (let [name-attr (make-blob-attr "users" "name")
            eid       (random-uuid)]
        (add-attrs! app [name-attr])
        (transact! app [[:add-triple eid (:id name-attr) "X"]])
        (drain!)
        (assert-aggregate-matches-actual! (:id app))

        (testing "updating to a larger value emits a delta"
          (let [size-before (get (aggregate-by-attr (:id app)) (:id name-attr))]
            (transact! app
                       [[:add-triple eid (:id name-attr)
                         "A much longer string than the previous one"]])
            (let [rows (queue-rows (:id app))]
              (is (seq rows))
              (is (every? #(= (:id name-attr) (:attr_id %)) rows)))
            (drain!)
            (assert-aggregate-matches-actual! (:id app))
            (is (< size-before
                   (get (aggregate-by-attr (:id app)) (:id name-attr))))))

        (testing "updating to an identical value emits no rows"
          (transact! app
                     [[:add-triple eid (:id name-attr)
                       "A much longer string than the previous one"]])
          (is (empty? (queue-rows (:id app)))))))))

(deftest delete-emits-negative-rows-and-zeros-out-aggregate
  (with-empty-app
    (fn [app]
      (let [name-attr (make-blob-attr "users" "name")
            eid       (random-uuid)]
        (add-attrs! app [name-attr])
        (transact! app [[:add-triple eid (:id name-attr) "Alice"]])
        (drain!)
        (let [size-before (get (aggregate-by-attr (:id app)) (:id name-attr))]
          (is (pos? size-before))

          (testing "deleting the entity emits a negative row matching the insert"
            (transact! app [[:delete-entity eid "users"]])
            (let [rows (queue-rows (:id app))]
              (is (seq rows))
              (is (every? #(neg? (:pg_size %)) rows))
              (is (= (- size-before)
                     (reduce + (map :pg_size rows))))))

          (testing "after collect, aggregate goes to zero"
            (drain!)
            (assert-aggregate-matches-actual! (:id app))
            (is (zero? (get (aggregate-by-attr (:id app)) (:id name-attr) 0)))))))))

(deftest collect-is-noop-on-empty-queue
  (with-empty-app
    (fn [app]
      (drain!)
      (is (empty? (queue-rows (:id app))))
      ;; calling again on an empty queue should be a no-op, not error
      (drain!)
      (is (empty? (queue-rows (:id app)))))))
