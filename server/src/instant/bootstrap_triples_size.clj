(ns instant.bootstrap-triples-size
  (:require
   [instant.config :as config]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.copy :as copy]
   [instant.jdbc.sql :as sql]
   [instant.jdbc.wal :as wal]
   [instant.util.hsql :as uhsql]
   [instant.util.tracer :as tracer])
  (:import
   (java.util HashMap)
   (java.util.function BiFunction Function)
   (org.postgresql.jdbc PgConnection)))

(def insert-triples-size-rows-q
  (uhsql/preformat {:insert-into [[:triples-size-updates [:app-id :attr-id :pg-size :files-size]]
                                  {:select [:app-id :attr-id :pg-size :files-size]
                                   :from [[[:unnest :?app-id :?attr-id :?pg-size :?files-size]
                                           [:t [:composite :app-id :attr-id :pg-size :files-size]]]]}]}))
(defn insert-triples-size-rows [group]
  (let [params (loop [app-id (transient [])
                      attr-id (transient [])
                      pg-size (transient [])
                      files-size (transient [])
                      group group]
                 (if-let [item (first group)]
                   (recur (conj! app-id (:app_id item))
                          (conj! attr-id (:attr_id item))
                          (conj! pg-size (:pg_size item))
                          (conj! files-size (:files_size item))
                          (next group))
                   {:app-id (with-meta (persistent! app-id)
                              {:pgtype "uuid[]"})
                    :attr-id (with-meta (persistent! attr-id)
                               {:pgtype "uuid[]"})
                    :pg-size (with-meta (persistent! pg-size)
                               {:pgtype "bigint[]"})
                    :files-size (with-meta (persistent! files-size)
                                  {:pgtype "bigint[]"})}))]
    (sql/do-execute! ::insert-triples-size-rows
                     (aurora/conn-pool :write)
                     (uhsql/formatp insert-triples-size-rows-q
                                    params))))

(defn delete-triples-size-rows [ids]
  (sql/do-execute! ::delete-triples-size-rows
                   (aurora/conn-pool :write)
                   ["delete from triples_size_updates where id = ANY(?::bigint[])"
                    (with-meta ids {:pgtype "bigint[]"})]))

(defn collect-sizes [^PgConnection conn]
  (let [files-size-id #uuid "96653230-13ff-ffff-2a35-24609fffffff"
        size-map (HashMap.)
        files-size-map (HashMap.)
        create-map-fn (reify Function
                        (apply [_ _k]
                          (HashMap.)))]
    (doseq [{:keys [app_id attr_id files_size pg_size]}
            (copy/copy-seq conn
                           "copy (select app_id, attr_id, pg_column_size(triples), case when attr_id = '96653230-13ff-ffff-2a35-24609fffffff' then triples_extract_number_value(value)::bigint else 0::bigint end as files_size from triples) to stdout with (format binary)"
                           [{:name :app_id
                             :pgtype "uuid"}
                            {:name :attr_id
                             :pgtype "uuid"}
                            {:name :pg_size
                             :pgtype "integer"}
                            {:name :files_size
                             :pgtype "bigint"}])]
      (when (= attr_id files-size-id)
        (HashMap/.compute files-size-map app_id (reify BiFunction
                                                  (apply [_ _k v]
                                                    (if v
                                                      (+ files_size v)
                                                      (long files_size))))))
      (let [app-map (.computeIfAbsent size-map app_id create-map-fn)]
        (HashMap/.compute app-map attr_id (reify BiFunction
                                            (apply [_ _k v]
                                              (if v
                                                (+ pg_size v)
                                                (long pg_size)))))))
    (for [[app-id attr-map] size-map
          [attr-id size] attr-map]
      {:app_id app-id
       :attr_id attr-id
       :pg_size size
       :files_size (when (= attr-id files-size-id)
                     (get files-size-map app-id))})))

(def slot-name "bootstrap_triples_size")

(defn bootstrap
  "Run this in the repl on one production instance after running the migration that
   adds the new tables."
  []
  (let [{:keys [connection]} (wal/create-sync-db-replication-slot-and-connection
                              (config/get-aurora-config)
                              slot-name)
        _ (when-not connection
            (throw (ex-info "Did not create replication slot" {:slot-name slot-name})))
        _ (wal/drop-logical-replication-slot (aurora/conn-pool :write)
                                             slot-name)
        {:keys [initial-rows
                ids-to-delete]}
        (tracer/with-span! {:name ::get-initial-rows}
          (with-open [conn ^PgConnection connection]
            {:initial-rows (collect-sizes conn)
             :ids-to-delete (map :id (sql/select ::ids-to-delete conn ["select id from triples_size_updates"]))}))]

    (tracer/with-span! {:name ::insert-initial-rows}
      (doseq [group (partition-all 5000 initial-rows)]
        (insert-triples-size-rows group)))
    (tracer/with-span! {:name ::delete-existing}
      (doseq [group (partition-all 5000 ids-to-delete)]
        (delete-triples-size-rows group)))
    (println "Set the disable-triples-size-collection flag to false to start the collection process.")))
