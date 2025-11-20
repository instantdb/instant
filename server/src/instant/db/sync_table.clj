(ns instant.db.sync-table
  (:require [instant.util.exception :as ex]
            [honey.sql :as hsql]
            [instant.db.datalog :as d]
            [instant.db.instaql :as instaql]
            [instant.db.model.attr :as attr-model]
            [instant.jdbc.aurora :as aurora]
            [instant.jdbc.sql :as sql]
            [instant.util.pg-hint-plan :as pg-hints]
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

(defn create-sync-process [ctx instaql-query]
  (let [_ (instaql/instaql-query->patterns ctx instaql-query) ;; validate query
        [tbl & rest-tbl] (-> instaql-query
                            keys)
        _ (when-not tbl
            (ex/throw-validation-err! :query
                                      {:q instaql-query}
                                      [{:message "Query is empty."}]))
        _ (when (seq rest-tbl)
            (ex/throw-validation-err! :query
                                      {:q instaql-query}
                                      [{:message "Query can only fetch a single namespace"}]))
        id-attr-id (:id (attr-model/seek-by-fwd-ident-name [(name tbl) "id"] (:attrs ctx)))
        _ (when-not id-attr-id
            (ex/throw-validation-err! :query
                                      {:q instaql-query}
                                      [{:message "No matching table."}]))

        child-forms (get instaql-query tbl)

        _ (when (seq (dissoc child-forms :$))
            (ex/throw-validation-err! :query
                                      {:q instaql-query}
                                      [{:message "Links are not yet supported."}]))

        _ (when-let [ks (-> child-forms
                            :$
                            (dissoc :order)
                            seq)]
            (ex/throw-validation-err! :query
                                      {:q instaql-query
                                       :invalid-keys ks}
                                      [{:message "Only order is currently supported."}]))

        [order-by-field order-by-direction] (-> child-forms
                                                (get-in [:$ :order] {:serverCreatedAt "asc"})
                                                first)

        direction (case order-by-direction
                    "asc" :asc
                    "desc" :desc)

        query-fields
        (if (= order-by-field :serverCreatedAt)
          {:order-by [[:t.created_at direction]
                      [:t.entity-id direction]]
           :where [:= :t.attr-id id-attr-id]
           :pg-hints [(pg-hints/index-scan :t :triples_created_at_idx)]}
          (let [attr (attr-model/seek-by-fwd-ident-name [(name tbl) (name order-by-field)]
                                                        (:attrs ctx))]
            (when-not attr
              (ex/throw-validation-err! :query
                                        {:q instaql-query}
                                        [{:message (str "Unknown order field " (name order-by-field))}]))
            (when-not (and (:index? attr)
                           (not (:indexing? attr))
                           (:checked-data-type attr))
              (ex/throw-validation-err! :query
                                        {:q instaql-query}
                                        [{:message "Order field must be indexed with a checked data type."}]))

            (let [order-col-value-fn (d/extract-value-fn (:checked-data-type attr) :>)]
              {:where [:and
                       [:= :t.attr-id (:id attr)]
                       :t.ave
                       [:= :checked_data_type [:cast
                                               [:inline (name (:checked-data-type attr))]
                                               :checked_data_type]]]
               :order-by [(if order-col-value-fn
                            [[order-col-value-fn :t.value] (if (= direction :desc)
                                                             :desc-nulls-last
                                                             :asc-nulls-first)]
                            [:t.value direction])
                          [:t.entity_id direction]]
               :pg-hints [(pg-hints/index-scan :t (if order-col-value-fn
                                                    (keyword (format "triples_%s_type_idx"
                                                                     (name (:checked-data-type attr))))
                                                    :ave_index))]})))

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
                                        :from [[{:union-all [(ea-select (name tbl))]}
                                                :t2]]}]
                                      :join_rows]]
                            :from [[:triples :t]]
                            :order-by (:order-by query-fields)
                            :where [:and
                                    [:= :t.app_id (:app-id ctx)]
                                    (:where query-fields)]
                            :pg-hints (concat [(pg-hints/index-scan :t_ea :ea_index)
                                               (pg-hints/index-scan :t_eav :eav_uuid_index)]
                                              (:pg-hints query-fields))})
        canceled? (atom false)]
    {:cancel (fn []
               (reset! canceled? true))
     :canceled? (fn []
                  @canceled?)
     :coarse-topics [[:ea '_ (attr-model/ea-ids-for-etype (name tbl) (:attrs ctx)) '_]]
     :start (fn [{:keys [batch-size
                         on-batch
                         on-init-finish]}]
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
                                 ;; TODO(sync-table):
                                 ;;   We need to also subscribe to attr changes that would affect us and update
                                 ;;   our topics when the attrs change
                                 :topics [[:ea '_ (attr-model/ea-ids-for-etype (name tbl) (:attrs ctx)) '_]]})))}))
