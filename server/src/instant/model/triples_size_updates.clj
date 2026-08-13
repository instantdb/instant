(ns instant.model.triples-size-updates
  (:require
   [chime.core]
   [instant.config :as config]
   [instant.discord :as discord]
   [instant.flags :as flags]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.util.hsql :as uhsql]
   [instant.util.tracer :as tracer])
  (:import
   (java.time Duration Instant)))

(defonce process (atom nil))

(def collect-batch-q
  (uhsql/preformat
   {:with [[:ids {:select :id
                  :from :triples-size-updates
                  :for [:update :skip-locked]
                  :order-by :id
                  :limit '?batch-size}]
           [:deletes {:delete-from :triples-size-updates
                      :using :ids
                      :where [:= :triples-size-updates.id :ids.id]
                      :returning [:app-id :attr-id :pg-size :files-size]}]
           [:aggregate {:insert-into [[:triples_size_aggregate [:app-id :attr-id :pg-size :files-size]]
                                      {:select [:deletes.app-id :deletes.attr-id [[:sum :deletes.pg_size] :pg-size] [[:sum :deletes.files-size] :files-size]]
                                       :from :deletes
                                       ;; Join filters out (app_id, attr_id) whose parent was deleted mid-batch.
                                       :join [:apps [:= :apps.id  :deletes.app-id]
                                              :attrs [:= :attrs.id :deletes.attr-id]]
                                       :group-by [:deletes.app-id :deletes.attr-id]
                                       ;; sort to avoid deadlock
                                       :order-by [:deletes.app-id :deletes.attr-id]}]
                        :on-conflict {:on-constraint :triples_size_aggregate_pkey}
                        :do-update-set {:pg-size [:+
                                                  :triples_size_aggregate.pg_size
                                                  :excluded.pg_size]
                                        ;; Update files-size only if one of the arguments is non-null
                                        :files-size [:coalesce
                                                     [:+
                                                      :triples_size_aggregate.files_size
                                                      :excluded.files_size]
                                                     :triples_size_aggregate.files_size
                                                     :excluded.files_size]}
                        ;; RETURNING makes this CTE referenceable below, which
                        ;; forces Postgres to execute it.
                        :returning [:1]}]]
    :select [[{:select [[[:count :*]]] :from :deletes} :deleted-count]
             [{:select [[[:count :*]]] :from :aggregate} :aggregated-count]]}))

(defn collect-batch!
  ([] (collect-batch! (aurora/conn-pool :write) (flags/triples-size-collection-batch-size)))
  ([conn batch-size]
   (sql/execute-one! ::collect-batch!
                     conn
                     (uhsql/formatp collect-batch-q {:batch-size batch-size}))))

(defn collect-batches!
  "Adds triples_size_updates to the triples_size_aggregates table and deletes them.
   Turn it off with the `disable-triples-size-collection` feature flag.

   `consecutive-limit-hits` is an atom tracking how many runs in a row have hit
   `max-loops`; we only alert once it exceeds the alert threshold so a transient
   backup doesn't page. It's reset whenever a run drains cleanly."
  ([max-loops] (collect-batches! max-loops (atom 0)))
  ([max-loops consecutive-limit-hits]
   (tracer/with-span! {:name ::collect-batches
                       :attributes {:max-loops max-loops}}
     (loop [loops 0
            total-collected 0
            total-aggregated 0]
       (if (= loops max-loops)
         (let [hits (swap! consecutive-limit-hits inc)]
           (tracer/add-data! {:attributes {:total-collected total-collected
                                           :total-aggregated total-aggregated
                                           :loops loops
                                           :consecutive-limit-hits hits}})
           (when (and (config/prod?)
                      (> hits (flags/triples-size-collection-loop-limit-alert-threshold)))
             (discord/send-error-async! (str (:instateam discord/mention-constants)
                                             " collect triples size is backed up after " loops " iterations"
                                             " (" hits " runs in a row)."))))
         (let [{:keys [deleted_count aggregated_count]} (collect-batch!)]
           ;; Drain on queue rows removed, not aggregate rows written: an
           ;; orphan-only batch deletes rows but writes 0 aggregates.
           (if (zero? (long deleted_count))
             (do
               (reset! consecutive-limit-hits 0)
               (tracer/add-data! {:attributes {:total-collected total-collected
                                               :total-aggregated total-aggregated
                                               :loops loops}}))
             (recur (inc loops)
                    (+ total-collected (long deleted_count))
                    (+ total-aggregated (long aggregated_count))))))))))

(defn start []
  (let [consecutive-limit-hits (atom 0)
        chime (chime.core/chime-at (chime.core/periodic-seq (Instant/now)
                                                            (Duration/ofMinutes (if (config/dev?)
                                                                                  60
                                                                                  5)))
                                   (fn [_]
                                     (when-not (or (flags/failing-over?)
                                                   (flags/disable-triples-size-collection?))
                                       (collect-batches! (flags/triples-size-collection-max-loops)
                                                         consecutive-limit-hits))))]
    {:shutdown (fn []
                 (.close chime))}))

(defn stop [process]
  ((:shutdown process)))

(defn start-global []
  (reset! process (start)))

(defn stop-global []
  (when-let [p @process]
    (stop p)
    (reset! process nil)))

(defn restart []
  (stop-global)
  (start-global))
