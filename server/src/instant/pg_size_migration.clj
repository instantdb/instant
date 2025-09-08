(ns instant.pg-size-migration
  (:require
   [instant.flags :as flags]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.util.async :as ua]
   [instant.util.hsql :as uhsql]
   [instant.util.pg-hint-plan :as hints]
   [instant.util.tracer :as tracer])
  (:import
   (java.util.concurrent CountDownLatch TimeUnit)))

(def migrate-q
  (uhsql/preformat {:update [:triples :t]
                    :set {:pg_size [[:triples_column_size :t]]}
                    :from [[{:select :ctid
                             :from [[:triples :t_s]]
                             :where [:= nil :t_s.pg_size]
                             :for [:update :skip-locked]
                             :limit :?batch-size}
                            :rows]]
                    :where [:= :t.ctid :rows.ctid]
                    :pg-hints [(hints/index-scan :t_s :triples_pg_size_idx)]}))

(defn migrate-pg-size-next-batch []
  (let [batch-size (flags/flag :migrate-pg-size-batch-size 1000)]
    (sql/do-execute! ::migrate-pg-size-batch
                     (aurora/conn-pool :write)
                     (uhsql/formatp migrate-q {:batch-size batch-size}))))

(defn start-triples-pg-size-migration-process []
  (let [shutdown (atom false)
        sleep-interrupt (CountDownLatch. 1)
        process (ua/vfut-bg
                  (loop []
                    (when (not @shutdown)
                      (if-not (flags/toggled? :run-pg-size-migration)
                        ;; Wait a minute to see if it's been re-enabled
                        (do (.await sleep-interrupt 1 TimeUnit/MINUTES)
                            (recur))

                        (do (migrate-pg-size-next-batch)
                            (when-let [delay-ms (flags/flag :migrate-pg-size-delay-ms)]
                              (.await sleep-interrupt delay-ms TimeUnit/MILLISECONDS))
                            (recur)))))
                  (tracer/record-info! {:name "pg-size-migration-shutdown"}))]
    (fn []
      (reset! shutdown true)
      (.countDown sleep-interrupt)
      @process)))

(declare global-shutdown)

(defn start-global []
  (def global-shutdown (start-triples-pg-size-migration-process)))

(defn stop-global []
  (when (bound? #'global-shutdown)
    (global-shutdown)))
