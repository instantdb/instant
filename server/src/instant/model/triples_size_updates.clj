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
                  :limit '?batch-size}]
           [:deletes {:delete-from :triples-size-updates
                      :using :ids
                      :where [:= :triples-size-updates.id :ids.id]
                      :returning [:app-id :attr-id :pg-size]}]]
    :insert-into [[:triples_size_aggregate [:app-id :attr-id :pg-size]]
                  {:select [:app-id :attr-id [[:sum :pg_size] :pg-size]]
                   :from :deletes
                   :group-by [:app-id :attr-id]}]
    :on-conflict {:on-constraint :triples_size_aggregate_pkey}
    :do-update-set {:pg-size [:+
                              :triples_size_aggregate.pg_size
                              :excluded.pg_size]}}))
(defn collect-batch!
  ([] (collect-batch! (aurora/conn-pool :write) (flags/triples-size-collection-batch-size)))
  ([conn batch-size]
   (sql/do-execute! ::collect-batch!
                    conn
                    (uhsql/formatp collect-batch-q {:batch-size batch-size}))))

(defn collect-batches!
  "Adds triples_size_updates to the triples_size_aggregates table and deletes them.
   Turn it off with the `disable-triples-size-collection` feature flag."
  [max-loops]
  (tracer/with-span! {:name ::collect-batches
                      :attributes {:max-loops max-loops}}
    (loop [loops 0
           total-collected 0]
      (if (= loops max-loops)
        (when (config/prod?)
          (discord/send-error-async! (str (:instateam discord/mention-constants)
                                          " collect triples size is backed up after " loops " iterations.")))
        (let [update-count (:next.jdbc/update-count (first (collect-batch!)))]
          (if (zero? update-count)
            (tracer/add-data! {:attributes {:total-collected total-collected
                                            :loops loops}})
            (recur (inc loops)
                   (+ total-collected (long update-count)))))))))

(defn start []
  (let [chime (chime.core/chime-at (chime.core/periodic-seq (Instant/now)
                                                            (Duration/ofMinutes (if (config/dev?)
                                                                                  60
                                                                                  5)))
                                   (fn [_]
                                     (when-not (or (flags/failing-over?)
                                                   (flags/disable-triples-size-collection?))
                                       (collect-batches! (flags/triples-size-collection-max-loops)))))]
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
