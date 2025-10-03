(ns instant.system-catalog-migration
  (:require
   [honey.sql :as hsql]
   [instant.db.model.attr :as attr-model]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.system-catalog :as system-catalog]
   [instant.util.tracer :as tracer]
   [lambdaisland.deep-diff2 :as ddiff]))

(defn missing-attrs [existing-attrs]
  (filter (fn [attr]
            (let [fwd-ident-name (->> attr
                                      :forward-identity
                                      (drop 1))]
              (not (attr-model/seek-by-fwd-ident-name fwd-ident-name existing-attrs))))
          system-catalog/all-attrs))

(defn mismatched-attrs [db-attrs]
  (keep (fn [attr]
          (let [db-attr (dissoc (attr-model/seek-by-id (:id attr) db-attrs)
                                :inferred-types
                                :catalog)]
            (when (not= db-attr attr)
              {:id (:id attr)
               :etype (attr-model/fwd-etype db-attr)
               :label (attr-model/fwd-label db-attr)
               :diff (ddiff/minimize (ddiff/diff attr db-attr))})))
        system-catalog/all-attrs))

(defn extra-attrs [db-attrs]
  (let [by-id (zipmap (map :id system-catalog/all-attrs)
                      system-catalog/all-attrs)]
    (keep (fn [attr]
            (when-not (get by-id (:id attr))
              {:id (:id attr)
               :etype (attr-model/fwd-etype attr)
               :label (attr-model/fwd-label attr)}))
          db-attrs)))

(defn ensure-attrs-on-system-catalog-app
  ([]
   (ensure-attrs-on-system-catalog-app system-catalog/system-catalog-app-id))
  ([app-id]
   (tracer/with-span! {:name "system-catalog/ensure-attrs-on-system-catalog-app"}
     (let [existing-attrs (attr-model/get-by-app-id (aurora/conn-pool :read) app-id)
           new-attrs (missing-attrs existing-attrs)
           ids (when (seq new-attrs)
                 (attr-model/insert-multi! (aurora/conn-pool :write)
                                           app-id
                                           new-attrs
                                           {:allow-reserved-names? true}))
           json-ids (keep (fn [a]
                            (when (= "meta" (attr-model/fwd-label a))
                              (:id a)))
                          new-attrs)
           string-ids (keep (fn [a]
                              (when (not= "meta" (attr-model/fwd-label a))
                                (:id a)))
                            new-attrs)
           mismatches (mismatched-attrs existing-attrs)
           extras (extra-attrs existing-attrs)]
       (when (seq mismatches)
         (tracer/record-info! {:name "system-catalog/mismatched-attrs"
                               :attributes {:mismatches (map (fn [m]
                                                               (update m :diff vec))
                                                             mismatches)}}))

       (when (seq extras)
         (tracer/record-info! {:name "system-catalog/extra-attrs"
                               :attributes {:extras extras}}))
       (when (seq json-ids)
         (sql/execute!
          (aurora/conn-pool :write)
          (hsql/format {:update :attrs
                        :where [:in :id json-ids]
                        :set {:inferred-types [:cast
                                               (attr-model/binary-inferred-types
                                                #{:json})
                                               [:bit :32]]}})))
       (when (seq string-ids)
         (sql/execute!
          (aurora/conn-pool :write)
          (hsql/format {:update :attrs
                        :where [:in :id string-ids]
                        :set {:inferred-types [:cast
                                               (attr-model/binary-inferred-types
                                                #{:string})
                                               [:bit :32]]}})))
       (tracer/add-data! {:attributes {:created-count (count ids)}})))))
