(ns instant.model.triples-size-updates-test
  (:require
   [clojure.test :as test :refer [deftest is testing]]
   [instant.db.model.attr :as attr-model]
   [instant.db.transaction :as tx]
   [instant.fixtures :refer [with-empty-app]]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.model.triples-size-updates :as tsu]
   [instant.system-catalog :as system-catalog]))

(def files-id-aid (system-catalog/get-attr-id "$files" "id"))
(def files-path-aid (system-catalog/get-attr-id "$files" "path"))
(def files-size-aid (system-catalog/get-attr-id "$files" "size"))
(def files-loc-aid (system-catalog/get-attr-id "$files" "location-id"))

(defn queue-rows [app-id]
  (sql/select (aurora/conn-pool :read)
              ["select attr_id, pg_size, files_size from triples_size_updates
                where app_id = ?::uuid order by id" app-id]))

(defn files-size-aggregate [app-id]
  (:files_size
   (sql/select-one (aurora/conn-pool :read)
                   ["select coalesce(sum(files_size), 0)::bigint as files_size
                     from triples_size_aggregate where app_id = ?::uuid" app-id])))

(defn actual-files-size [app-id]
  (:files_size
   (sql/select-one (aurora/conn-pool :read)
                   ["select coalesce(sum(triples_extract_number_value(value)), 0)::bigint as files_size
                     from triples where app_id = ?::uuid and attr_id = ?::uuid"
                    app-id files-size-aid])))

(defn assert-files-size-aggregate-matches-actual! [app-id]
  (is (= (actual-files-size app-id)
         (files-size-aggregate app-id))))

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

(defn insert-file! [app file-id size]
  (transact! app
             [[:add-triple file-id files-id-aid (str file-id)]
              [:add-triple file-id files-path-aid (str "path-" file-id ".png")]
              [:add-triple file-id files-size-aid size]
              [:add-triple file-id files-loc-aid (str "loc-" file-id)]]))

(deftest insert-file-emits-files-size-on-size-attr-only
  (with-empty-app
    (fn [app]
      (drain!) ;; flush anything from app creation
      (let [file-id (random-uuid)]
        (insert-file! app file-id 100)

        (testing "queue rows carry files_size only on the $files.size row"
          (let [rows (queue-rows (:id app))
                by-attr (into {} (map (juxt :attr_id :files_size)) rows)]
            (is (= 100 (get by-attr files-size-aid)))
            (is (every? zero? (vals (dissoc by-attr files-size-aid))))))

        (drain!)
        (testing "aggregate files_size matches sum of $files.size values"
          (assert-files-size-aggregate-matches-actual! (:id app))
          (is (= 100 (actual-files-size (:id app)))))

        (testing "adding a second file accumulates"
          (insert-file! app (random-uuid) 250)
          (drain!)
          (assert-files-size-aggregate-matches-actual! (:id app))
          (is (= 350 (actual-files-size (:id app)))))))))

(deftest update-files-size-emits-delta
  (with-empty-app
    (fn [app]
      (let [file-id (random-uuid)]
        (insert-file! app file-id 100)
        (drain!)
        (is (= 100 (files-size-aggregate (:id app))))

        (testing "growing the size emits a positive files_size delta"
          (transact! app [[:add-triple file-id files-size-aid 250]])
          (let [rows (filter #(= files-size-aid (:attr_id %))
                             (queue-rows (:id app)))]
            (is (seq rows))
            (is (= 150 (reduce + (map :files_size rows)))))
          (drain!)
          (assert-files-size-aggregate-matches-actual! (:id app))
          (is (= 250 (files-size-aggregate (:id app)))))

        (testing "shrinking the size emits a negative files_size delta"
          (transact! app [[:add-triple file-id files-size-aid 10]])
          (let [rows (filter #(= files-size-aid (:attr_id %))
                             (queue-rows (:id app)))]
            (is (seq rows))
            (is (= -240 (reduce + (map :files_size rows)))))
          (drain!)
          (assert-files-size-aggregate-matches-actual! (:id app))
          (is (= 10 (files-size-aggregate (:id app)))))

        (testing "updating to the same size emits no rows"
          (transact! app [[:add-triple file-id files-size-aid 10]])
          (is (empty? (queue-rows (:id app)))))))))

(deftest delete-file-emits-negative-files-size
  (with-empty-app
    (fn [app]
      (let [file-id (random-uuid)]
        (insert-file! app file-id 100)
        (drain!)
        (is (= 100 (files-size-aggregate (:id app))))

        (testing "deleting the file emits a negative files_size on the size row"
          (transact! app [[:delete-entity file-id "$files"]])
          (let [rows (filter #(= files-size-aid (:attr_id %))
                             (queue-rows (:id app)))]
            (is (seq rows))
            (is (= -100 (reduce + (map :files_size rows))))))

        (drain!)
        (testing "after collect, aggregate files_size is 0"
          (assert-files-size-aggregate-matches-actual! (:id app))
          (is (zero? (files-size-aggregate (:id app)))))))))

(deftest collect-is-noop-on-empty-queue
  (with-empty-app
    (fn [app]
      (drain!)
      (is (empty? (queue-rows (:id app))))
      ;; calling again on an empty queue should be a no-op, not error
      (drain!)
      (is (empty? (queue-rows (:id app)))))))
