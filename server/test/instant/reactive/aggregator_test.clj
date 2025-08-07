(ns instant.reactive.aggregator-test
  (:require
   [clojure.string :as string]
   [clojure.test :as test :refer [deftest is]]
   [instant.data.bootstrap :as bootstrap]
   [instant.data.resolvers :as resolvers]
   [instant.db.attr-sketch :as cms]
   [instant.db.model.attr :as attr-model]
   [instant.db.model.triple :as triple-model]
   [instant.fixtures :refer [with-empty-app]]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.jdbc.wal :as wal]
   [instant.reactive.aggregator :as agg]
   [instant.util.crypt :as crypt-util]
   [instant.util.test :refer [wait-for]])
  (:import
   (java.util UUID)))

(def ^:dynamic *in-test* false)

(defn copy-sql-for-app-ids
  "copy command that only copies the app we are interested in"
  [app-ids]
  (format "copy (select app_id, attr_id, value, checked_data_type from triples where app_id = ANY('{%s}'::uuid[])) to stdout with (format binary)"
          (string/join "," (map #(UUID/.toString %) app-ids))))

(defn check-sketches [app r]
  (let [triples (sql/select (aurora/conn-pool :read)
                            ["select * from triples where app_id = ?" (:id app)])
        attr-groups (group-by :attr_id triples)
        value-groups (group-by #(select-keys % [:attr_id :value :checked_data_type]) triples)
        sketches (cms/all-for-attrs (aurora/conn-pool :read)
                                    (:id app)
                                    (attr-model/get-by-app-id (:id app)))]
    (doseq [[attr-id triples] attr-groups]
      (is (= (count triples)
             (:total (get sketches attr-id)))
          (str "count mismatch for " (resolvers/->friendly r attr-id))))

    (doseq [[{:keys [attr_id value checked_data_type]} triples] value-groups
            :when (not (coll? value))]
      (is (= (count triples)
             (cms/check (get sketches attr_id) checked_data_type value))
          (str "count mismatch for " (resolvers/->friendly r attr_id) " value=" value)))))

(deftest bootstrap
  (with-empty-app
    (fn [app]
      (with-redefs [agg/test-filter
                    (fn [changes]
                      (vec (filter (fn [change]
                                     (let [app-id (get-in change [:triples-data :app-id])]
                                       (if *in-test*
                                         (= app-id (:id app))
                                         (not= app-id (:id app)))))
                                   changes)))]
        ;; Add some data before we start the process so we have some data to bootstrap
        (bootstrap/add-movies-to-app! (:id app))
        (binding [*in-test* true]
          (let [slot-suffix (crypt-util/random-hex 16)
                slot-name (wal/full-slot-name agg/slot-type slot-suffix)
                movies-r (resolvers/make-movies-resolver (:id app))]
            (try
              (let [shutdown (agg/start {:slot-suffix slot-suffix
                                         :copy-sql (copy-sql-for-app-ids [(:id app)])
                                         :acquire-slot-interval-ms 10000
                                         :sketch-flush-ms 10
                                         :sketch-flush-max-items 1000})]
                (try
                  (let [attrs (attr-model/get-by-app-id (:id app))
                        sketches (cms/all-for-attrs (aurora/conn-pool :read) (:id app) attrs)]
                    (doseq [attr attrs]
                      (is (= (count (triple-model/fetch (aurora/conn-pool :read)
                                                        (:id app)
                                                        [[:= :attr-id (:id attr)]]))
                             (or (:total (get sketches (:id attr))) 0))
                          (str "count matches for " (resolvers/->friendly movies-r (:id attr))))))
                  (check-sketches app movies-r)

                  (finally (shutdown))))
              (finally
                (sql/do-execute! (aurora/conn-pool :write)
                                 ["select pg_terminate_backend(active_pid) from pg_replication_slots where slot_name = ? and active"
                                  slot-name])
                (wal/drop-logical-replication-slot (aurora/conn-pool :write) slot-name)
                (sql/do-execute! (aurora/conn-pool :write)
                                 ["delete from wal_aggregator_status where slot_name = ?" slot-name])))))))))

(deftest captures-changes
  (with-empty-app
    (fn [app]
      (with-redefs [agg/test-filter
                    (fn [changes]
                      (vec (filter (fn [change]
                                     (let [app-id (get-in change [:triples-data :app-id])]
                                       (if *in-test*
                                         (= app-id (:id app))
                                         (not= app-id (:id app)))))
                                   changes)))]
        (binding [*in-test* true]
          (let [slot-suffix (crypt-util/random-hex 16)
                slot-name (wal/full-slot-name agg/slot-type slot-suffix)]
            (try
              (let [shutdown (agg/start {:slot-suffix slot-suffix
                                         :copy-sql (copy-sql-for-app-ids [(:id app)])
                                         :acquire-slot-interval-ms 10000
                                         :sketch-flush-ms 10
                                         :sketch-flush-max-items 1000})]
                (try
                  ;; add some data after startup so that we can test the wal-slot aggregator
                  (bootstrap/add-zeneca-to-app! (:id app))
                  (let [zeneca-r (resolvers/make-zeneca-resolver (:id app))
                        ;; create a new transaction so that we can be sure the aggregator
                        ;; will advance past `next-lsn`
                        {:keys [lsn]} (sql/execute-one!
                                        (aurora/conn-pool :write)
                                        ["with write as (
                                            update triples set value = '\"alex2\"'::jsonb
                                                     where app_id = ? and attr_id = ? and entity_id = ?
                                                 returning *
                                          ) select * from write, pg_current_wal_insert_lsn() as lsn"
                                         (:id app)
                                         (resolvers/->uuid zeneca-r :users/handle)
                                         (resolvers/->uuid zeneca-r "eid-alex")])
                        ;; Wait for sketches to catch up
                        _ (wait-for #(>= 0 (compare lsn
                                                    (cms/get-start-lsn (aurora/conn-pool :read)
                                                                       {:slot-name slot-name})))
                                    1000)]

                    (check-sketches app zeneca-r))
                  (finally (shutdown))))
              (finally
                (sql/do-execute! (aurora/conn-pool :write)
                                 ["select pg_terminate_backend(active_pid) from pg_replication_slots where slot_name = ? and active"
                                  slot-name])
                (wal/drop-logical-replication-slot (aurora/conn-pool :write) slot-name)
                (sql/do-execute! (aurora/conn-pool :write)
                                 ["delete from wal_aggregator_status where slot_name = ?" slot-name])))))))))

(deftest claims-slot-when-it-is-available
  (with-empty-app
    (fn [app]
      (with-redefs [agg/test-filter
                    (fn [changes]
                      (vec (filter (fn [change]
                                     (let [app-id (get-in change [:triples-data :app-id])]
                                       (if *in-test*
                                         (= app-id (:id app))
                                         (not= app-id (:id app)))))
                                   changes)))]
        (binding [*in-test* true]
          (let [slot-suffix (crypt-util/random-hex 16)
                slot-name (wal/full-slot-name agg/slot-type slot-suffix)
                get-aggregator-status
                (fn []
                  (sql/select-one (aurora/conn-pool :read)
                                  ["select * from wal_aggregator_status where slot_name = ?"
                                   slot-name]))]
            (bootstrap/add-zeneca-to-app! (:id app))
            (try
              (let [pid-a (str "a_" (crypt-util/random-hex 12))
                    pid-b (str "b_" (crypt-util/random-hex 12))
                    shutdown-a (agg/start {:slot-suffix slot-suffix
                                           :copy-sql (copy-sql-for-app-ids [(:id app)])
                                           :acquire-slot-interval-ms 10
                                           :sketch-flush-ms 10
                                           :sketch-flush-max-items 1000
                                           :process-id pid-a})
                    shutdown-b (agg/start {:slot-suffix slot-suffix
                                           :copy-sql (copy-sql-for-app-ids [(:id app)])
                                           :acquire-slot-interval-ms 10
                                           :sketch-flush-ms 10
                                           :sketch-flush-max-items 1000
                                           :process-id pid-b})]
                (try
                  (let [r (resolvers/make-zeneca-resolver (:id app))]
                    ;; create a new transaction so that we can see who grabbed the slot.
                    (sql/execute! (aurora/conn-pool :write)
                                  ["update triples set value = '\"alex2\"'::jsonb where app_id = ? and attr_id = ? and entity_id = ?"
                                   (:id app)
                                   (resolvers/->uuid r :users/handle)
                                   (resolvers/->uuid r "eid-alex")])

                    ;; wait for the transaction to be handled
                    (wait-for #(contains? #{pid-a pid-b}
                                          (:process_id (get-aggregator-status)))
                              1000)

                    (let [live-pid (:process_id (get-aggregator-status))
                          next-pid (if (= live-pid pid-a)
                                     pid-b
                                     pid-a)]

                      ;; shutdown the process that has the slot
                      (condp = live-pid
                        pid-a (shutdown-a)
                        pid-b (shutdown-b))

                      ;; Create another update
                      (sql/execute! (aurora/conn-pool :write)
                                    ["update triples set value = '\"alex3\"'::jsonb where app_id = ? and attr_id = ? and entity_id = ?"
                                     (:id app)
                                     (resolvers/->uuid r :users/handle)
                                     (resolvers/->uuid r "eid-alex")])

                      (wait-for #(= next-pid (:process_id (get-aggregator-status)))
                                1000)

                      (check-sketches app r)))
                  (finally
                    (shutdown-a)
                    (shutdown-b))))
              (finally
                (sql/do-execute! (aurora/conn-pool :write)
                                 ["select pg_terminate_backend(active_pid) from pg_replication_slots where slot_name = ? and active"
                                  slot-name])
                (wal/drop-logical-replication-slot (aurora/conn-pool :write) slot-name)
                (sql/do-execute! (aurora/conn-pool :write)
                                 ["delete from wal_aggregator_status where slot_name = ?" slot-name])))))))))

(comment
  (test/run-tests *ns*))
