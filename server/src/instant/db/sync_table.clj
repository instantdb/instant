(ns instant.db.sync-table
  (:require [instant.util.exception :as ex]
            [honey.sql :as hsql]
            [instant.db.model.attr :as attr-model]
            [instant.jdbc.aurora :as aurora]
            [instant.jdbc.sql :as sql]
            [instant.db.instaql :as instaql]
            [instant.db.datalog :as datalog]
            [instant.util.pg-hint-plan :as pg-hints]
            [medley.core :refer [dissoc-in]]
            [next.jdbc]))

(defn run-sync [conn canceled? batch-size handle-batch query]
  (let [join-rows
        (sql/plan-reduce ::run-sync
                         conn
                         query
                         {:fetch-size batch-size
                          :init []
                          :reducer (fn [acc row]
                                     (if @canceled?
                                       (reduced [])
                                       (let [next-acc (conj acc (:join_rows row))]
                                         (if (>= (count next-acc) batch-size)
                                           (do (handle-batch next-acc)
                                               [])
                                           next-acc))))})]
    (when (seq join-rows)
      (handle-batch join-rows))))

;; XXX: We should introduce some back pressure
(defn create-sync-process [ctx instaql-query]
  (let [ns (-> instaql-query
               keys
               first)
        _ (tool/def-locals)
        _ (when-not ns
            (ex/throw-validation-err! :query
                                      {:q instaql-query}
                                      [{:message "Query is empty."}]))
        _ (when (not= 1 (count (keys instaql-query)))
            (ex/throw-validation-err! :query
                                      {:q instaql-query}
                                      [{:message "Query can only fetch a single namespace"}]))
        id-attr-id (:id (attr-model/seek-by-fwd-ident-name [(name ns) "id"] (:attrs ctx)))
        _ (when-not id-attr-id
            (ex/throw-validation-err! :query
                                      {:q instaql-query}
                                      [{:message "No matching table."}]))
        _ (tool/def-locals)
        ea-select (fn [ns-str]
                    {:select :*
                     :from [[:triples :t_ea]]
                     :where [:and
                             [:= :t_ea.app-id (:app-id ctx)]
                             [:= :t_ea.entity_id :t.entity_id]
                             :t_ea.ea
                             [:= :t_ea.attr_id [:any (with-meta (attr-model/ea-ids-for-etype ns-str (:attrs ctx))
                                                       {:pgtype "uuid[]"})]]]})

        query (hsql/format {:select [[[{:select [[[:json_agg
                                                   [:json_build_array
                                                    :t2.entity_id
                                                    :t2.attr_id
                                                    :t2.value
                                                    :t2.created_at]]]]
                                        ;; Collects all of the ea triples for a single row
                                        ;; Each row we get back from the database is a json
                                        ;; array of all of the ea triples for an entity.
                                        :from [[{:union-all [(ea-select (name ns))]}
                                                :t2]]}]
                                      :join_rows]]
                            :from [[:triples :t]]
                            :order-by [[:t.created_at :asc]]
                            :where [:and
                                    [:= :t.app_id (:app-id ctx)]
                                    [:= :t.attr-id id-attr-id]]
                            :pg-hints [(pg-hints/index-scan :t1 :triples_created_at_idx)
                                       (pg-hints/index-scan :t_ea :ea_index)
                                       (pg-hints/index-scan :t_eav :eav_uuid_index)]})
        canceled? (atom false)]
    (tool/def-locals)
    {:cancel (fn []
               (reset! canceled? true))
     :coarse-topics [[:ea '_ (attr-model/ea-ids-for-etype (name ns) (:attrs ctx)) '_]]
     :start (fn [{:keys [batch-size
                         on-batch
                         on-init-finish]}]
              ;; XXX: Add migration to add the index to the transactions table
              (let [{:keys [tx-id]}
                    (next.jdbc/with-transaction [conn (aurora/conn-pool :read)]
                      (.setTransactionIsolation conn java.sql.Connection/TRANSACTION_REPEATABLE_READ)
                      (let [{:keys [id]} (sql/select-one ::get-start-tx-id
                                                         conn
                                                         ["select coalesce(max(id), 0) as id from transactions where app_id = ?"
                                                          (:app-id ctx)])]
                        (run-sync conn canceled? batch-size on-batch query)
                        {:tx-id id}))]
                (on-init-finish {:tx-id tx-id
                                 ;; XXX: We need to also subscribe to attr changes that would affect us and update
                                 ;;      our topics when the attrs change
                                 :topics [[:ea '_ (attr-model/ea-ids-for-etype (name ns) (:attrs ctx)) '_]]})))}))


;; 1. We need to store the wal logs somewhere so that we can reapply them
;;   - fields
;;     - app_id
;;     - lsn
;;     - topics
;;     - data (in s3?)
;;   - Need some kind of mechanism for disposing of older logs
;;   - It would be nice if we could store everything in s3, but then how would we do topic filtering?
