(ns instant.scripts.clone-app
  (:require
   [clojure.java.shell :as shell]
   [clojure.string :as str]
   [instant.config :as config]
   [instant.jdbc.sql :as sql]
   [instant.util.hsql :as uhsql]
   [next.jdbc :as next-jdbc]
   [instant.comment :as comment]
   [instant.model.instant-user :as instant-user-model]
   [instant.model.app :as app-model]
   [instant.jdbc.aurora :as aurora]
   [incanter.core :as i]
   [honey.sql :as hsql]
   [clojure.tools.logging :as log])
  (:import
   (java.time Duration)
   (java.util UUID)))

;; ----------- 
;; Assert column counts

(def ^:private column-count-q
  (uhsql/preformat
   {:select [[[:count :*] :count]]
    :from :information_schema.columns
    :where [:and
            [:= :table-schema [:inline "public"]]
            [:= :table-name :?table-name]]}))

(defn- get-column-count [conn table-name]
  (-> (sql/select-one conn (uhsql/formatp column-count-q {:table-name table-name}))
      :count))

(defn- assert-table-column-count [conn table-name expected]
  (let [got (get-column-count conn table-name)]
    (assert
     (= got expected)
     (format
      "Check for new columns in %s table and update clone_app.clj. Expected %d columns, but got %d"
      table-name expected got))))

(defn- assert-table-column-counts [conn]
  (assert-table-column-count conn "triples" 13)
  (assert-table-column-count conn "idents" 5)
  (assert-table-column-count conn "attrs" 22)
  (assert-table-column-count conn "rules" 2))

;; ------------ 
;; set-up-empty-clone-app!

(def ^:private insert-ident-map-q
  (uhsql/preformat
   {:insert-into [[:clone-app-ident-map [:job-id :old-id :new-id]]
                  {:select [:?job-id :id :%gen_random_uuid]
                   :from :idents
                   :where [:= :app-id :?source-app-id]}]}))

(def ^:private insert-attr-map-q
  (uhsql/preformat
   {:insert-into [[:clone-app-attr-map [:job-id :old-id :new-id]]
                  {:select [:?job-id :id :%gen_random_uuid]
                   :from :attrs
                   :where [:= :app-id :?source-app-id]}]}))

(def ^:private insert-idents-q
  (uhsql/preformat
   {:insert-into [[:idents [:id
                            :app-id
                            :attr-id
                            :etype
                            :label]]
                  {:select [:im.new-id
                            :?new-app-id
                            :am.new-id
                            :i.etype
                            :i.label]
                   :from [[:idents :i]]
                   :join [[:clone-app-ident-map :im]
                          [:and
                           [:= :im.job-id :?job-id]
                           [:= :im.old-id :i.id]]
                          [:clone-app-attr-map :am]
                          [:and
                           [:= :am.job-id :?job-id]
                           [:= :am.old-id :i.attr-id]]]
                   :where [:= :i.app-id :?source-app-id]}]}))

(def ^:private insert-attrs-q
  (uhsql/preformat
   {:insert-into [[:attrs [:id
                           :app-id
                           :value-type
                           :cardinality
                           :is-unique
                           :is-indexed
                           :forward-ident
                           :reverse-ident
                           :inferred-types
                           :on-delete
                           :checked-data-type
                           :checking-data-type
                           :indexing
                           :setting-unique
                           :on-delete-reverse
                           :is-required
                           :etype
                           :label
                           :reverse-etype
                           :reverse-label
                           :deletion-marked-at
                           :metadata]]
                  {:select [:am.new-id
                            :?new-app-id
                            :a.value-type
                            :a.cardinality
                            :a.is-unique
                            :a.is-indexed
                            :im-fwd.new-id
                            :im-rev.new-id
                            :a.inferred-types
                            :a.on-delete
                            :a.checked-data-type
                            :a.checking-data-type
                            :a.indexing
                            :a.setting-unique
                            :a.on-delete-reverse
                            :a.is-required
                            :a.etype
                            :a.label
                            :a.reverse-etype
                            :a.reverse-label
                            :a.deletion-marked-at
                            :a.metadata]
                   :from [[:attrs :a]]
                   :join [[:clone-app-attr-map :am]
                          [:and
                           [:= :am.job-id :?job-id]
                           [:= :am.old-id :a.id]]
                          [:clone-app-ident-map :im-fwd]
                          [:and
                           [:= :im-fwd.job-id :?job-id]
                           [:= :im-fwd.old-id :a.forward-ident]]]
                   :left-join [[:clone-app-ident-map :im-rev]
                               [:and
                                [:= :im-rev.job-id :?job-id]
                                [:= :im-rev.old-id :a.reverse-ident]]]
                   :where [:= :a.app-id :?source-app-id]}]}))

(def ^:private insert-rules-q
  (uhsql/preformat
   {:insert-into [[:rules [:app-id :code]]
                  {:select [:?new-app-id :r.code]
                   :from [[:rules :r]]
                   :where [:= :r.app-id :?source-app-id]}]}))

(defn setup-empty-clone-app! [conn {:keys [job-id temporary-creator-id source-app-id dest-title]}]
  ;; todo: should do this inside a transaction
  (let [new-app-id (random-uuid)
        new-admin-token (random-uuid)
        app (app-model/create! conn {:id new-app-id
                                     :admin-token new-admin-token
                                     :title dest-title
                                     :creator-id temporary-creator-id})]

    ;; map idents + create them 
    (sql/do-execute! conn
                     (uhsql/formatp insert-ident-map-q {:job-id job-id
                                                        :source-app-id source-app-id}))
    (sql/do-execute! conn
                     (uhsql/formatp insert-idents-q {:new-app-id new-app-id
                                                     :job-id job-id
                                                     :source-app-id source-app-id}))
    ;; map attrs + create them
    (sql/do-execute! conn
                     (uhsql/formatp insert-attr-map-q {:job-id job-id
                                                       :source-app-id source-app-id}))
    (sql/do-execute! conn
                     (uhsql/formatp insert-attrs-q {:new-app-id new-app-id
                                                    :job-id job-id
                                                    :source-app-id source-app-id}))
    ;; copy over rules
    (sql/do-execute! conn
                     (uhsql/formatp insert-rules-q {:new-app-id new-app-id
                                                    :source-app-id source-app-id}))
    app))

;; -------------- 
;; Worker ranges 

(def ^:private worker-ranges-q
  (uhsql/preformat
   {:with [[:ordered {:select [:entity-id
                               [[:over [[:ntile [:cast :?num-workers :int]]
                                        {:order-by [:entity-id]}]]
                                :bucket]]
                      :from :triples
                      :where [:= :app-id :?source-app-id]}]
           [:buckets {:select-distinct-on [[:bucket]
                                           :bucket
                                           [:entity-id :start-entity-id]]
                      :from :ordered
                      :order-by [:bucket :entity-id]}]
           [:ranges {:select [:bucket
                              :start-entity-id
                              [[:over [[:lead :start-entity-id]
                                       {:order-by [:bucket]}]]
                               :end-entity-id]]
                     :from :buckets}]]
    :select [:bucket :start-entity-id :end-entity-id]
    :from :ranges
    :order-by :bucket}))

(comment
  (sql/select (aurora/conn-pool :read)
              (uhsql/formatp worker-ranges-q
                             {:source-app-id (:id zeneca-app)
                              :num-workers 3})))

(defn get-worker-ranges
  "This does one pass over app triples, and divides up the entity ids into `num-workers` regions.
  
  This way each worker can consume its own region, and expect that the triples will be contiguous
  on disk. 

  The reason we did this was to optimize for page cache locality.
  
  Note: this assumes the `conn` comes with a snapshot, so that all workers see a consistent
        view"
  [conn source-app-id num-workers]
  (sql/select conn
              (uhsql/formatp worker-ranges-q
                             {:source-app-id source-app-id
                              :num-workers num-workers})))

;; --------------- 
;; worker 

(def ^:private lowest-uuid
  (UUID/fromString "00000000-0000-0000-0000-000000000000"))

;; todo: can we try to get this as a preformat?
(defn- triples-batch-q [has-end?]
  (let [where (cond-> [:and
                       [:= :t.app-id :?source-app-id]
                       [:>= :t.entity-id :?start-entity-id]
                       [:> [:composite :t.entity-id :t.attr-id :t.value-md5]
                        [:composite :?last-entity-id :?last-attr-id :?last-value-md5]]]
                has-end? (conj [:< :t.entity-id :?end-entity-id]))]
    {:with [[:batch {:select [:t.entity-id
                              :t.attr-id
                              :t.value
                              :t.value-md5
                              :t.ea
                              :t.eav
                              :t.av
                              :t.ave
                              :t.vae
                              :t.created-at
                              :t.checked-data-type
                              :t.pg-size]
                     :from [[:triples :t]]
                     :where where
                     :order-by [:t.entity-id :t.attr-id :t.value-md5]
                     :limit :?batch-size}]
            [:ins {:insert-into [[:triples
                                  [:app-id
                                   :entity-id
                                   :attr-id
                                   :value
                                   :value-md5
                                   :ea
                                   :eav
                                   :av
                                   :ave
                                   :vae
                                   :created-at
                                   :checked-data-type
                                   :pg-size]]
                                 {:select [:?new-app-id
                                           :b.entity-id
                                           [[:coalesce :am.new-id :b.attr-id] :attr-id]
                                           :b.value
                                           :b.value-md5
                                           :b.ea
                                           :b.eav
                                           :b.av
                                           :b.ave
                                           :b.vae
                                           :b.created-at
                                           :b.checked-data-type
                                           :b.pg-size]
                                  :from [[:batch :b]]
                                  :left-join [[:clone-app-attr-map :am]
                                              [:and
                                               [:= :am.job-id :?job-id]
                                               [:= :am.old-id :b.attr-id]]]}]}]]
     :select [[{:select [[[:count :*]]]
                :from :batch} :rows]
              [{:select :entity-id
                :from :batch
                :order-by [[:entity-id :desc]
                           [:attr-id :desc]
                           [:value-md5 :desc]]
                :limit 1} :last-entity-id]
              [{:select :attr-id
                :from :batch
                :order-by [[:entity-id :desc]
                           [:attr-id :desc]
                           [:value-md5 :desc]]
                :limit 1} :last-attr-id]
              [{:select :value-md5
                :from :batch
                :order-by [[:entity-id :desc]
                           [:attr-id :desc]
                           [:value-md5 :desc]]
                :limit 1} :last-value-md5]]}))

(defn- run-worker!
  [conn {:keys [job-id source-app-id dest-app-id batch-size
                start-entity-id end-entity-id]} worker-id]
  (let [batch-q (triples-batch-q (some? end-entity-id))]
    (log/infof "clone-app worker %s starting (source=%s dest=%s start=%s end=%s batch=%s)"
               worker-id source-app-id dest-app-id start-entity-id end-entity-id batch-size)
    (loop [last-key [lowest-uuid lowest-uuid ""]
           total (long 0)]
      (let [{:keys [rows last_entity_id last_attr_id last_value_md5]}
            (sql/execute-one! conn
                              (hsql/format
                               batch-q
                               {:params {:source-app-id source-app-id
                                         :start-entity-id start-entity-id
                                         :end-entity-id end-entity-id
                                         :last-entity-id (nth last-key 0)
                                         :last-attr-id (nth last-key 1)
                                         :last-value-md5 (nth last-key 2)
                                         :batch-size batch-size
                                         :new-app-id dest-app-id
                                         :job-id job-id}}))]
        (let [rows (long rows)]
          (if (zero? rows)
            (do
              (log/infof "clone-app worker %s done (rows=%s)" worker-id total)
              total)
            (let [next-key [last_entity_id last_attr_id last_value_md5]
                  next-total (+ total rows)]
              (log/infof "clone-app worker %s progress (rows=%s)" worker-id next-total)
              (recur next-key next-total))))))))

;; --------------- 
;; clone-app 

(defn clone-app! [conn {:keys [source-app-id
                               temporary-creator-id
                               dest-creator-id
                               dest-title
                               num-workers
                               batch-size]}]
  (assert-table-column-counts conn)
  (let [job-id (random-uuid)
        ;; todo: actually create the job
        _source-app (app-model/get-by-id! {:id source-app-id})
        _temporary-creator (instant-user-model/get-by-id! {:id temporary-creator-id})
        _dest-creator (instant-user-model/get-by-id! {:id dest-creator-id})

        empty-clone-app (setup-empty-clone-app! conn {:job-id job-id
                                                      :temporary-creator-id temporary-creator-id
                                                      :source-app-id source-app-id
                                                      :dest-title dest-title})

        {dest-app-id :id} empty-clone-app
        worker-ranges (get-worker-ranges conn source-app-id num-workers)

        worker-futures (mapv (fn [{:keys [bucket]
                                   start-entity-id :start_entity_id
                                   end-entity-id :end_entity_id}]
                               (future
                                 (run-worker! (aurora/conn-pool :write)
                                              {:job-id job-id
                                               :source-app-id source-app-id
                                               :dest-app-id dest-app-id
                                               :batch-size batch-size
                                               :start-entity-id start-entity-id
                                               :end-entity-id end-entity-id}
                                              bucket)))
                             worker-ranges)]
    (doseq [f worker-futures]
      @f)))

(comment
  (def zeneca-app (comment/zeneca-app!))
  (def u (instant-user-model/get-by-email {:email "stepan.p@gmail.com"}))

  (app-model/change-creator! {:id (:id zeneca-app)
                              :new-creator-id (:id u)})

  (get-column-count (aurora/conn-pool :read) "instant_users")

  (assert-table-column-counts (aurora/conn-pool :read))

  (clone-app!
   (aurora/conn-pool :write)
   {:source-app-id (:id zeneca-app)
    :temporary-creator-id (:id u)
    :dest-creator-id (:id u)
    :dest-title "cloned-app-2"
    :num-workers 2
    :batch-size 100}))
