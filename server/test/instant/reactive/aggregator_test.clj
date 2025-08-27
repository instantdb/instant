(ns instant.reactive.aggregator-test
  (:require
   [clojure.string :as string]
   [clojure.test :as test :refer [deftest is testing]]
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
   [instant.util.json :refer [->json]]
   [instant.util.test :refer [wait-for]])
  (:import
   (java.util UUID)))

(def ^:dynamic *in-test* false)

(defn copy-sql-for-app-ids
  "copy command that only copies the app we are interested in"
  [app-ids]
  (format "copy (select app_id, attr_id, entity_id, value, checked_data_type, created_at, eav, ea from triples where app_id = ANY('{%s}'::uuid[]) order by app_id, attr_id) to stdout with (format binary)"
          (string/join "," (map #(UUID/.toString %) app-ids))))

(defn check-sketches [app r]
  (let [triples (sql/select (aurora/conn-pool :read)
                            ["select * from triples where app_id = ?" (:id app)])
        attr-groups (group-by :attr_id triples)
        value-groups (group-by #(select-keys % [:attr_id :value :checked_data_type]) triples)
        reverse-value-groups (group-by #(select-keys % [:attr_id :entity_id])
                                       (filter (fn [t]
                                                 (and (not (:ea t))
                                                      (:eav t)))
                                               triples))
        sketches (cms/all-for-attrs (aurora/conn-pool :read)
                                    (:id app)
                                    (attr-model/get-by-app-id (:id app)))]
    (doseq [[attr-id triples] attr-groups]
      (is (= (count triples)
             (:total (:sketch (get sketches attr-id))))
          (str "count mismatch for " (resolvers/->friendly r attr-id))))

    (doseq [[{:keys [attr_id value checked_data_type]} triples] value-groups
            :when (not (coll? value))]
      (is (= (count triples)
             (cms/check (:sketch (get sketches attr_id))
                        (keyword checked_data_type)
                        (if (= "date" checked_data_type)
                          (triple-model/parse-date-value value)
                          value)))
          (str "count mismatch for " (resolvers/->friendly r attr_id) " value=" value)))

    (doseq [[{:keys [attr_id entity_id]} triples] reverse-value-groups]
      (is (= (count triples)
             (cms/check (:reverse-sketch (get sketches attr_id))
                        nil
                        entity_id))
          (str "count mismatch for reverse ref " (resolvers/->friendly r attr_id) " entity_id=" entity_id)))))

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
        (bootstrap/add-zeneca-to-app! {:checked-data? true
                                       :indexed-data? true}
                                      (:id app))
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
                  (check-sketches app movies-r)
                  (check-sketches app (resolvers/make-zeneca-resolver (:id app)))

                  (finally (shutdown))))
              (finally
                (sql/do-execute! (aurora/conn-pool :write)
                                 ["select pg_terminate_backend(active_pid) from pg_replication_slots where slot_name = ? and active"
                                  slot-name])
                (wal/drop-logical-replication-slot (aurora/conn-pool :write) slot-name)
                (sql/do-execute! (aurora/conn-pool :write)
                                 ["delete from wal_aggregator_status where slot_name = ?" slot-name])))))))))

(defn wait-for-sketches-to-catch-up
  "Creates a transaction to force the lsn to advance so that we can be
   sure we've processed all of the sketches have caught up."
  [slot-name]
  (let [lsn (:lsn (first
                    (sql/execute!
                      (aurora/conn-pool :write)
                      ["with write as (
                       insert into config (k, v) values ('kick-wal', to_jsonb(now())) on conflict (k) do update set v = excluded.v
                       returning *
                      )
                      select *, pg_current_wal_insert_lsn() as lsn from write"])))]
    (wait-for #(> 0 (compare lsn
                             (cms/get-start-lsn (aurora/conn-pool :read)
                                                {:slot-name slot-name})))
              1000)))

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
          (let [slot-suffix (str "cc_" (crypt-util/random-hex 16))
                slot-name (wal/full-slot-name agg/slot-type slot-suffix)
                get-aggregator-status
                (fn []
                  (sql/select-one (aurora/conn-pool :read)
                                  ["select * from wal_aggregator_status where slot_name = ?"
                                   slot-name]))]
            (try
              (let [pid-a (str "a_" (crypt-util/random-hex 12))
                    pid-b (str "b_" (crypt-util/random-hex 12))
                    shutdown-a (agg/start {:slot-suffix slot-suffix
                                           :copy-sql (copy-sql-for-app-ids [(:id app)])
                                           :acquire-slot-interval-ms 100
                                           :sketch-flush-ms 10
                                           :sketch-flush-max-items 1000
                                           :process-id pid-a})
                    shutdown-b (agg/start {:slot-suffix slot-suffix
                                           :copy-sql (copy-sql-for-app-ids [(:id app)])
                                           :acquire-slot-interval-ms 100
                                           :sketch-flush-ms 10
                                           :sketch-flush-max-items 1000
                                           :process-id pid-b})]
                (try

                  (wait-for #(contains? #{pid-a pid-b}
                                        (:process_id (get-aggregator-status)))
                            1000)
                  ;; add some data after startup so that we can test the wal-slot aggregator
                  (bootstrap/add-zeneca-to-app! {:checked-data? true
                                                 :indexed-data? true}
                                                (:id app))

                  (let [live-pid (:process_id (get-aggregator-status))
                        zeneca-r (resolvers/make-zeneca-resolver (:id app))
                        ;; create a new transaction so that we can be sure the aggregator
                        ;; will advance past `next-lsn
                        update-res (sql/do-execute!
                                     (aurora/conn-pool :write)
                                     ["update triples set value = '\"alex2\"'::jsonb
                                           where app_id = ? and attr_id = ? and entity_id = ?"
                                      (:id app)
                                      (resolvers/->uuid zeneca-r :users/handle)
                                      (resolvers/->uuid zeneca-r "eid-alex")])

                        _ (is (= [{:next.jdbc/update-count 1}] update-res))

                        _ (wait-for-sketches-to-catch-up slot-name)

                        ;; Shutdown the process that has the slot so that we clear any sketches
                        ;; cached in memory
                        _ (condp = live-pid
                            pid-a (shutdown-a)
                            pid-b (shutdown-b))

                        ;; Create a transaction that will update an existing sketch (with ave)
                        update-res (sql/do-execute!
                                     (aurora/conn-pool :write)
                                     ["update triples set value = ?::jsonb
                                           where app_id = ? and attr_id = ? and eav
                                             and entity_id = ? and value = ?::jsonb"
                                      (->json (str (resolvers/->uuid zeneca-r "eid-web-development-with-clojure")))
                                      (:id app)
                                      (resolvers/->uuid zeneca-r :bookshelves/books)
                                      (resolvers/->uuid zeneca-r "eid-currently-reading")
                                      (->json (str (resolvers/->uuid zeneca-r "eid-heroes")))])

                        _ (is (= [{:next.jdbc/update-count 1}] update-res))

                        _ (wait-for-sketches-to-catch-up slot-name)]

                    (check-sketches app zeneca-r))
                  (finally (shutdown-a)
                           (shutdown-b))))
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
                    (let [update-res (sql/do-execute! (aurora/conn-pool :write)
                                       ["update triples set value = '\"alex2\"'::jsonb where app_id = ? and attr_id = ? and entity_id = ?"
                                        (:id app)
                                        (resolvers/->uuid r :users/handle)
                                        (resolvers/->uuid r "eid-alex")])]
                      (is (= [{:next.jdbc/update-count 1}] update-res)))

                    (wait-for-sketches-to-catch-up slot-name)

                    (let [live-pid (:process_id (get-aggregator-status))
                          next-pid (if (= live-pid pid-a)
                                     pid-b
                                     pid-a)]

                      ;; shutdown the process that has the slot
                      (condp = live-pid
                        pid-a (shutdown-a)
                        pid-b (shutdown-b))

                      ;; Create another update
                      (let [update-res (sql/do-execute!
                                         (aurora/conn-pool :write)
                                         ["update triples set value = '\"alex3\"'::jsonb
                                            where app_id = ? and attr_id = ? and entity_id = ?"
                                          (:id app)
                                          (resolvers/->uuid r :users/handle)
                                          (resolvers/->uuid r "eid-alex")])]
                        (is (= [{:next.jdbc/update-count 1}] update-res))

                        (testing "the new process picks up the slot"
                          (wait-for #(= next-pid (:process_id (get-aggregator-status)))
                                    1000))

                        (wait-for-sketches-to-catch-up slot-name))

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

(deftest value-too-large
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
          (let [slot-suffix (str "vtl_" (crypt-util/random-hex 16))
                slot-name (wal/full-slot-name agg/slot-type slot-suffix)]
            (try
              (bootstrap/add-movies-to-app! (:id app))
              (let [r (resolvers/make-movies-resolver (:id app))
                    _ (sql/execute-one!
                        (aurora/conn-pool :write)
                        ["update triples
                            set value = to_jsonb(repeat('x', 40000000))
                          where app_id = ? and attr_id = ? and entity_id = ?
                          returning entity_id"
                         (:id app)
                         (resolvers/->uuid r :movie/title)
                         (resolvers/->uuid r "eid-robocop")])
                    shutdown (agg/start {:slot-suffix slot-suffix
                                         :copy-sql (copy-sql-for-app-ids [(:id app)])
                                         :acquire-slot-interval-ms 10000
                                         :sketch-flush-ms 10
                                         :sketch-flush-max-items 1000})]

                (try
                  (testing "handles value-too-large in setup"
                    (is (= 1 (:total-not-binned
                               (:sketch (cms/for-attr (aurora/conn-pool :read)
                                                      (:id app)
                                                      (resolvers/->uuid r :movie/title))))))

                    (is (thrown-with-msg? Throwable #"String value length"
                                          (sql/select-one (aurora/conn-pool :read)
                                                          ["select value
                                                            from triples
                                                           where app_id = ?
                                                             and attr_id = ?
                                                             and entity_id = ?"
                                                           (:id app)
                                                           (resolvers/->uuid r :movie/title)
                                                           (resolvers/->uuid r "eid-robocop")]))))

                  (let [update-result (sql/do-execute!
                                        (aurora/conn-pool :write)
                                        ["update triples
                                              set value = to_jsonb(repeat('y', 40000000))
                                            where app_id = ? and attr_id = ? and entity_id = ?"
                                         (:id app)
                                         (resolvers/->uuid r :movie/title)
                                         (resolvers/->uuid r "eid-alien")])]
                    (is (= [{:next.jdbc/update-count 1}] update-result))

                    (wait-for-sketches-to-catch-up slot-name)

                    (testing "handles value-too-large in listener"
                      (is (thrown-with-msg? Throwable
                                            #"String value length"
                                            (sql/select-one
                                              (aurora/conn-pool :read)
                                              ["select value
                                                  from triples
                                                 where app_id = ?
                                                   and attr_id = ?
                                                   and entity_id = ?"
                                               (:id app)
                                               (resolvers/->uuid r :movie/title)
                                               (resolvers/->uuid r "eid-alien")])))

                      (is (= 2 (:total-not-binned
                                 (:sketch (cms/for-attr (aurora/conn-pool :read)
                                                        (:id app)
                                                        (resolvers/->uuid r :movie/title))))))))
                  ;; add some data after startup so that we can test the wal-slot aggregator
                  (finally (shutdown))))
              (finally
                (sql/do-execute! (aurora/conn-pool :write)
                                 ["select pg_terminate_backend(active_pid) from pg_replication_slots where slot_name = ? and active"
                                  slot-name])
                (wal/drop-logical-replication-slot (aurora/conn-pool :write) slot-name)
                (sql/do-execute! (aurora/conn-pool :write)
                                 ["delete from wal_aggregator_status where slot_name = ?" slot-name])))))))))

(deftest add-remove-checked-data-type
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
          (let [slot-suffix (str "cdt_" (crypt-util/random-hex 16))
                slot-name (wal/full-slot-name agg/slot-type slot-suffix)]
            (try
              (bootstrap/add-zeneca-to-app! {:checked-data? true
                                             :indexed-data? true}
                                            (:id app))
              (let [r (resolvers/make-zeneca-resolver (:id app))
                    toast-res ;; Add a date that will get toasted
                    (sql/do-execute!
                      (aurora/conn-pool :write)
                      ["update triples
                          set value = to_jsonb(?::text)
                        where app_id = ? and attr_id = ? and entity_id = ?"
                       ;; Add a string that's big so that postgres will toast it
                       (str (apply str (repeat 10000000 " "))
                            "2025-08-12T23:00:31.368181Z")
                       (:id app)
                       (resolvers/->uuid r :users/createdAt)
                       (resolvers/->uuid r "eid-alex")])
                    shutdown (agg/start {:slot-suffix slot-suffix
                                         :copy-sql (copy-sql-for-app-ids [(:id app)])
                                         :acquire-slot-interval-ms 10000
                                         :sketch-flush-ms 10
                                         :sketch-flush-max-items 1000})]
                (try

                  (testing "setting the date worked"
                    (is (= [{:next.jdbc/update-count 1}] toast-res)))

                  (let [uncheck-result (sql/do-execute!
                                         (aurora/conn-pool :write)
                                         ["update triples
                                              set checked_data_type = null
                                            where app_id = ? and attr_id = ? and checked_data_type = 'date'"
                                          (:id app)
                                          (resolvers/->uuid r :users/createdAt)])]

                    (testing "setting unchecked worked"
                      (is (= [{:next.jdbc/update-count 4}] uncheck-result)))

                    (wait-for-sketches-to-catch-up slot-name)

                    (testing "removing checked-data-type works"
                      (check-sketches app r)))

                  (let [check-result (sql/do-execute!
                                       (aurora/conn-pool :write)
                                       ["update triples
                                            set checked_data_type = 'date'
                                          where app_id = ? and attr_id = ? and checked_data_type is null"
                                        (:id app)
                                        (resolvers/->uuid r :users/createdAt)])]

                    (testing "setting checked worked"
                      (is (= [{:next.jdbc/update-count 4}] check-result)))

                    (wait-for-sketches-to-catch-up slot-name)

                    (testing "adding checked-data-type works"
                      (check-sketches app r)))
                  (finally (shutdown))))
              (finally
                (sql/do-execute! (aurora/conn-pool :write)
                                 ["select pg_terminate_backend(active_pid) from pg_replication_slots where slot_name = ? and active"
                                  slot-name])
                (wal/drop-logical-replication-slot (aurora/conn-pool :write) slot-name)
                (sql/do-execute! (aurora/conn-pool :write)
                                 ["delete from wal_aggregator_status where slot_name = ?" slot-name])))))))))

(comment
  (test/run-tests *ns*))
