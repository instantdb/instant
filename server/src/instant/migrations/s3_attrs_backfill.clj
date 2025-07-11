(ns instant.migrations.s3-attrs-backfill
  "Migration script to backfill hash and lastModified fields for existing $files records.
   
   This migration populates the new S3 metadata fields introduced by the S3 attrs proposal:
   - hash: The S3 ETag value (provider-agnostic naming)
   - lastModified: The S3 last-modified timestamp in epoch milliseconds
   
   The migration processes files in batches to handle large datasets efficiently
   and includes comprehensive error handling and progress tracking."
  (:require
   [clojure.tools.logging :as log]
   [honey.sql :as hsql]
   [instant.db.model.attr :as attr-model]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.storage.s3 :as s3]
   [instant.system-catalog :as system-catalog]
   [instant.util.json :refer [<-json ->json]]
   [instant.util.tracer :as tracer])
  (:import [java.security MessageDigest]))

;; Configuration
;; --------------

(def ^:private config-key "s3-attrs-migration-status")
(def ^:private batch-size 50) ; Smaller batch size for S3 API calls
(def ^:private max-retries 3)

;; Helper functions
;; ----------------

(defn md5
  "Calculate MD5 hash of a string (used for triple value_md5)"
  [^String s]
  (let [digest (.digest (MessageDigest/getInstance "MD5") (.getBytes s "UTF-8"))]
    (format "%032x" (new java.math.BigInteger 1 digest))))

(defn get-attr-ids
  "Get the attribute IDs for $files attributes from the system catalog"
  []
  (let [attrs (attr-model/get-by-app-id (aurora/conn-pool :read) 
                                        system-catalog/system-catalog-app-id)
        files-attrs (filter #(= "$files" (attr-model/fwd-etype %)) attrs)]
    (reduce (fn [acc attr]
              (let [label (attr-model/fwd-label attr)]
                (assoc acc (keyword label) (:id attr))))
            {}
            files-attrs)))

(defn get-migration-state
  "Get the current migration state from the config table"
  []
  (let [{:keys [v]} (sql/select-one (aurora/conn-pool :read) 
                                    ["select v from config where k = ?" config-key])]
    (or v {})))

(defn update-migration-state!
  "Update the migration state in the config table"
  [new-state]
  (sql/execute! (aurora/conn-pool :write)
                ["insert into config (k, v) values (?, ?) on conflict (k) do update set v = ?"
                 config-key new-state new-state]))

(defn get-files-batch
  "Get a batch of files that need S3 metadata populated"
  [attr-ids last-entity-id]
  (let [files-id-attr-id (:id attr-ids)
        location-id-attr-id (:location-id attr-ids)
        
        query (merge 
               {:select [:files.entity_id :location.value]
                :from [[:triples :files]]
                :join [[:triples :location] 
                       [:and 
                        [:= :files.app_id :location.app_id]
                        [:= :files.entity_id :location.entity_id]
                        [:= :location.attr_id location-id-attr-id]]]
                :where [:and
                        [:= :files.app_id system-catalog/system-catalog-app-id]
                        [:= :files.attr_id files-id-attr-id]
                        ;; Only files that don't already have hash populated
                        [:not [:exists {:select :1
                                        :from [[:triples :existing_hash]]
                                        :where [:and
                                                [:= :existing_hash.app_id system-catalog/system-catalog-app-id]
                                                [:= :existing_hash.entity_id :files.entity_id]
                                                [:= :existing_hash.attr_id (:hash attr-ids)]]}]]]
                :limit batch-size
                :order-by [:files.entity_id]}
               
               (when last-entity-id
                 {:where [:and
                          [:= :files.app_id system-catalog/system-catalog-app-id]
                          [:= :files.attr_id files-id-attr-id]
                          [:> :files.entity_id last-entity-id]
                          [:not [:exists {:select :1
                                          :from [[:triples :existing_hash]]
                                          :where [:and
                                                  [:= :existing_hash.app_id system-catalog/system-catalog-app-id]
                                                  [:= :existing_hash.entity_id :files.entity_id]
                                                  [:= :existing_hash.attr_id (:hash attr-ids)]]}]]]}))
        
        files (sql/select (aurora/conn-pool :read) (hsql/format query))]
    
    (mapv (fn [{:keys [entity_id value]}]
            {:entity-id entity_id
             :location-id (<-json value)})
          files)))

(defn process-file
  "Process a single file to get S3 metadata and insert triples"
  [attr-ids {:keys [entity-id location-id]} retry-count]
  (try
    (log/info "Processing file" {:entity-id entity-id :location-id location-id :retry retry-count})
    
    ;; Get S3 metadata (this calls the existing format-object function)
    (let [s3-metadata (s3/get-object-metadata system-catalog/system-catalog-app-id location-id)
          {:keys [hash last-modified]} s3-metadata
          
          ;; Prepare triples for insertion
          triples [;; Hash triple
                   [system-catalog/system-catalog-app-id
                    entity-id
                    (:hash attr-ids)
                    (->json hash)
                    (md5 (->json hash))
                    true false false true false :string]
                   
                   ;; LastModified triple  
                   [system-catalog/system-catalog-app-id
                    entity-id
                    (:lastModified attr-ids)
                    (->json last-modified)
                    (md5 (->json last-modified))
                    true false false true false :number]]]
      
      ;; Insert the triples
      (doseq [triple triples]
        (sql/execute! (aurora/conn-pool :write)
                      (hsql/format {:insert-into :triples
                                    :columns [:app_id :entity_id :attr_id :value :value_md5 
                                              :ea :eav :av :ave :vae :checked_data_type]
                                    :values [triple]
                                    :on-conflict [:app_id :entity_id :attr_id :value_md5]
                                    :do-nothing true})))
      
      {:success true :entity-id entity-id})
    
    (catch Exception e
      (log/error e "Error processing file" {:entity-id entity-id :location-id location-id :retry retry-count})
      
      (if (< retry-count max-retries)
        ;; Retry with exponential backoff
        (do 
          (Thread/sleep (* 1000 (Math/pow 2 retry-count)))
          (process-file attr-ids {:entity-id entity-id :location-id location-id} (inc retry-count)))
        ;; Max retries exceeded
        {:success false :entity-id entity-id :error (.getMessage e)}))))

(defn process-batch
  "Process a batch of files"
  [attr-ids files-batch]
  (tracer/with-span! {:name "s3-attrs-migration/process-batch"
                      :attributes {:batch-size (count files-batch)}}
    (let [results (mapv #(process-file attr-ids % 0) files-batch)
          successful (filter :success results)
          failed (filter #(not (:success %)) results)]
      
      (tracer/add-data! {:attributes {:successful-count (count successful)
                                      :failed-count (count failed)}})
      
      (when (seq failed)
        (log/warn "Failed to process files" {:failed-entities (mapv :entity-id failed)}))
      
      {:successful (count successful)
       :failed (count failed)
       :last-entity-id (-> files-batch last :entity-id)})))

;; Main migration function
;; -----------------------

(defn backfill-s3-attrs!
  "Main migration function to backfill hash and lastModified for existing $files records.
   
   This function:
   1. Processes files in batches to avoid overwhelming S3 API
   2. Tracks progress in the config table for resumability
   3. Handles errors gracefully with retry logic
   4. Provides comprehensive logging and metrics
   
   The migration can be safely rerun - it will skip files that already have 
   the metadata populated and resume from where it left off."
  []
  (tracer/with-span! {:name "s3-attrs-migration/backfill"}
    (log/info "Starting S3 attrs backfill migration")
    
    (let [state (get-migration-state)]
      (if (:completed state)
        (do
          (log/info "S3 attrs migration already completed")
          {:status :already-completed})
        
        (let [attr-ids (get-attr-ids)]
          (log/info "Starting migration with attr IDs" attr-ids)
          
          (loop [last-entity-id (:last-entity-id state)
                 total-processed (:total-processed state 0)
                 total-successful (:total-successful state 0)
                 total-failed (:total-failed state 0)]
            
            (log/info "Processing batch" {:last-entity-id last-entity-id 
                                          :total-processed total-processed})
            
            (let [files-batch (get-files-batch attr-ids last-entity-id)]
              (if (empty? files-batch)
                ;; No more files to process - mark as completed
                (do
                  (update-migration-state! {:completed true
                                            :total-processed total-processed
                                            :total-successful total-successful
                                            :total-failed total-failed
                                            :completed-at (System/currentTimeMillis)})
                  (log/info "S3 attrs migration completed successfully" 
                            {:total-processed total-processed
                             :total-successful total-successful
                             :total-failed total-failed})
                  {:status :completed
                   :total-processed total-processed
                   :total-successful total-successful
                   :total-failed total-failed})
                
                ;; Process the batch
                (let [{:keys [successful failed last-entity-id]} (process-batch attr-ids files-batch)
                      new-total-processed (+ total-processed (count files-batch))
                      new-total-successful (+ total-successful successful)
                      new-total-failed (+ total-failed failed)]
                  
                  ;; Update state for resumability
                  (update-migration-state! {:last-entity-id last-entity-id
                                            :total-processed new-total-processed
                                            :total-successful new-total-successful
                                            :total-failed new-total-failed
                                            :completed false})
                  
                  (log/info "Processed batch" {:successful successful
                                               :failed failed
                                               :total-processed new-total-processed})
                  
                  ;; Continue with next batch
                  (recur last-entity-id 
                         new-total-processed
                         new-total-successful
                         new-total-failed))))))))))

;; Utility functions for operations
;; ---------------------------------

(defn reset-migration!
  "Reset the migration state - useful for testing or if you need to restart"
  []
  (sql/execute! (aurora/conn-pool :write)
                ["delete from config where k = ?" config-key])
  (log/info "Migration state reset"))

(defn get-migration-stats
  "Get current migration statistics"
  []
  (let [state (get-migration-state)
        attr-ids (get-attr-ids)
        
        ;; Count total files
        total-files-query {:select [[[:count :*] :total]]
                           :from :triples
                           :where [:and
                                   [:= :app_id system-catalog/system-catalog-app-id]
                                   [:= :attr_id (:id attr-ids)]]}
        
        total-files (:total (sql/select-one (aurora/conn-pool :read) 
                                            (hsql/format total-files-query)))
        
        ;; Count files with hash populated
        processed-files-query {:select [[[:count :*] :processed]]
                               :from :triples
                               :where [:and
                                       [:= :app_id system-catalog/system-catalog-app-id]
                                       [:= :attr_id (:hash attr-ids)]]}
        
        processed-files (:processed (sql/select-one (aurora/conn-pool :read)
                                                     (hsql/format processed-files-query)))]
    
    (merge state
           {:total-files total-files
            :processed-files processed-files
            :remaining-files (- total-files processed-files)
            :completion-percentage (if (> total-files 0)
                                     (Math/round (* 100.0 (/ processed-files total-files)))
                                     100)})))

;; Public API for running the migration
;; ------------------------------------

(defn run-migration!
  "Public function to run the S3 attrs backfill migration.
   
   Usage:
     (require '[instant.migrations.s3-attrs-backfill :as migration])
     (migration/run-migration!)
   
   This function is safe to run multiple times - it will resume from where it left off."
  []
  (backfill-s3-attrs!))

(comment
  ;; Example usage:
  
  ;; Check migration status
  (get-migration-stats)
  
  ;; Run the migration
  (run-migration!)
  
  ;; Reset migration if needed (use with caution!)
  ;; (reset-migration!)
  ) 