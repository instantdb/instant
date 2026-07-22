(ns instant.backup
  (:require
   [clojure.string]
   [honey.sql :as hsql]
   [instant.config :as config]
   [instant.dash.ephemeral-app :refer [ephemeral-creator]]
   [instant.db.model.attr :as attr-model]
   [instant.isn]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.copy :as copy]
   [instant.jdbc.sql :as sql]
   [instant.jdbc.wal :as wal]
   [instant.model.app :as app-model]
   [instant.model.app-file :as app-file-model]
   [instant.model.rule :as rule-model]
   [instant.model.schema :as schema]
   [instant.model.webhook :as webhook-model]
   [instant.storage.s3 :refer [s3-transfer-manager]]
   [instant.util.async :as ua]
   [instant.util.defrecord :refer [defrecord-once]]
   [instant.util.hsql :as uhsql]
   [instant.util.json :as json]
   [instant.util.s3 :as s3]
   [instant.util.tracer :as tracer]
   [instant.util.uuid :as uuid-util]
   [next.jdbc])
  (:import
   (com.fasterxml.jackson.core JsonFactory JsonGenerator)
   (com.fasterxml.jackson.core.util MinimalPrettyPrinter)
   (com.github.luben.zstd Zstd ZstdOutputStream)
   (com.google.common.util.concurrent RateLimiter)
   (java.lang.reflect InvocationHandler InvocationTargetException Proxy)
   (java.sql Connection)
   (java.time Duration Instant)
   (java.util ArrayList HashMap)
   (java.util.concurrent LinkedBlockingQueue)
   (java.util.concurrent.locks ReentrantLock)
   (javax.sql DataSource)
   (okio Okio Pipe)
   (org.apache.commons.io.output CountingOutputStream)
   (org.postgresql.jdbc PgConnection PgConnection)
   (software.amazon.awssdk.core.async AsyncRequestBody)))

(def insert-backup-job-q
  (uhsql/preformat {:insert-into :backup-jobs
                    :values [{:id :?id
                              :isn :?isn
                              :backup-at :?backup-at
                              :machine-id :?machine-id}]}))

(defn insert-backup-job!
  ([params] (insert-backup-job! (aurora/conn-pool :write) params))
  ([conn {:keys [id isn backup-at machine-id]}]
   (sql/do-execute! ::insert-backup-job!
                    conn
                    (uhsql/formatp insert-backup-job-q
                                   {:id id
                                    :isn isn
                                    :backup-at backup-at
                                    :machine-id machine-id}))))

(def update-backup-progress-q
  (uhsql/preformat {:update :backup-jobs
                    :set {:max-app-id :?max-app-id
                          :triples-processed :?triples-processed
                          :apps-processed :?apps-processed}
                    :where [:= :id :?id]}))

(defn update-backup-progress!
  ([params] (update-backup-progress! (aurora/conn-pool :write) params))
  ([conn {:keys [id max-app-id triple-count app-count]}]
   (sql/do-execute! ::update-backup-progress!
                    conn
                    (uhsql/formatp update-backup-progress-q
                                   {:id id
                                    :max-app-id max-app-id
                                    :triples-processed triple-count
                                    :apps-processed app-count}))))

(defn mark-backup-completed!
  ([params] (mark-backup-completed! (aurora/conn-pool :write) params))
  ([conn {:keys [id]}]
   (sql/do-execute! ::update-backup-progress!
                    conn
                    ["update backup_jobs set completed_at = now() where id = ?", id])))

(def insert-app-backup-q
  (uhsql/preformat {:insert-into :app-backups
                    :values [{:id :?id
                              :app-id :?app-id
                              :isn :?isn
                              :backup-at :?backup-at
                              :storage-prefix :?storage-prefix
                              :files-size :?files-size
                              :db-size :?db-size
                              :uncompressed-size :?uncompressed-size
                              :description :?description
                              :expires-at :?expires-at}]}))

(defn insert-app-backup!
  ([params] (insert-app-backup! (aurora/conn-pool :write) params))
  ([conn {:keys [id app-id isn backup-at storage-prefix files-size db-size uncompressed-size description expires-at]}]
   (sql/do-execute! ::insert-app-backup!
                    conn
                    (uhsql/formatp insert-app-backup-q
                                   {:id id
                                    :app-id app-id
                                    :isn isn
                                    :backup-at backup-at
                                    :storage-prefix storage-prefix
                                    :files-size files-size
                                    :db-size db-size
                                    :uncompressed-size uncompressed-size
                                    :description description
                                    ;; Can't be longer than 32 days because the storage rule
                                    ;; will automatically delete anything tagged with `expire`
                                    ;; after 32 days.
                                    :expires-at expires-at}))))

(def get-app-backups-by-app-id-q
  (uhsql/preformat {:select [:id :app-id :isn :backup-at :files-size :db-size :uncompressed-size :description :expires-at]
                    :from :app-backups
                    :where [:= :app-id :?app-id]
                    :order-by [[:backup-at :desc]]}))

(defn get-app-backups-by-app-id
  ([params] (get-app-backups-by-app-id (aurora/conn-pool :read) params))
  ([conn {:keys [app-id]}]
   (sql/select ::get-app-backups-by-app-id
               conn
               (uhsql/formatp get-app-backups-by-app-id-q {:app-id app-id}))))

(def get-app-backup-by-id-q
  (uhsql/preformat {:select [:id :app-id :isn :backup-at :storage-prefix
                             :files-size :db-size :uncompressed-size :description :expires-at]
                    :from :app-backups
                    :where [:and
                            [:= :id :?id]
                            [:= :app-id :?app-id]]}))

(defn get-app-backup-by-id
  ([params] (get-app-backup-by-id (aurora/conn-pool :read) params))
  ([conn {:keys [id app-id]}]
   (sql/select-one ::get-app-backup-by-id
                   conn
                   (uhsql/formatp get-app-backup-by-id-q
                                  {:id id
                                   :app-id app-id}))))

;; Make sure the order of the columns matches the order of the record
(defrecord-once Triple [app-id entity-id value created-at etype label many])
(def columns [{:name :app-id
               :pgtype "uuid"}
              {:name :entity-id
               :pgtype "uuid"}
              {:name :value
               :pgtype "text"}
              {:name :created-at
               :pgtype "bigint"}
              {:name :etype
               :pgtype "text"}
              {:name :label
               :pgtype "text"}
              {:name :many
               :pgtype "boolean"}])

(defn triples-seq
  "Returns a seq of triples ordered by app-id, entity-id, then attr-id"
  [^PgConnection conn start-app-id]
  (let [select (hsql/format {:select [:t.app_id
                                      :t.entity_id
                                      [[:cast :t.value :text] :value]
                                      :t.created_at
                                      :a.etype
                                      :a.label
                                      [[:= :a.cardinality [:inline "many"]] :many]]
                             :from [[:triples :t]]
                             :join [[:attrs :a] [:= :a.id :t.attr_id]
                                    [:apps :app] [:= :app.id :t.app_id]]
                             :where [:and
                                     [:not= :app.creator-id [:inline (uuid-util/coerce (:id @ephemeral-creator))]]
                                     [:= nil :a.deletion-marked-at]
                                     [:= nil :app.deletion-marked-at]
                                     (when start-app-id
                                       [:>= :t.app_id [:inline (uuid-util/coerce start-app-id)]])]
                             :limit [:inline 1]
                             :order-by [[:t.app_id] [:t.entity_id] [:t.attr_id]]})
        _ (assert (= 1 (count select)) "The select query cannot have parameters")
        q (format "COPY (%s) to stdout with (format binary)"
                  (first select))
        copy-seq (copy/copy-seq conn
                                q

                                columns
                                {:row-fn ->Triple})]
    copy-seq))

(defprotocol IStream
  (get-entity-count [this])
  (inc-entity-count! [this])
  (get-triple-count [this])
  (add-triple-count! [this n])
  (get-uncompressed-size [this]))

(deftype Stream [^String etype
                 ^JsonGenerator generator
                 ^CountingOutputStream counter
                 finish
                 force-close
                 ^:unsynchronized-mutable ^long entity-count
                 ^:unsynchronized-mutable ^long triple-count]
  IStream
  (get-entity-count [this]
    (.entity_count this))
  (inc-entity-count! [this]
    (set! (.entity_count this) (inc (.entity_count this))))
  (get-triple-count [this]
    (.triple_count this))
  (add-triple-count! [this n]
    (set! (.triple_count this) (+ (.triple_count this) n)))
  (get-uncompressed-size [_this]
    (.getByteCount counter))
  Object
  (toString [_]
    (str "#Stream{:etype " (pr-str etype)
         ", :entity-count " entity-count "}")))

(defmethod print-method Stream [^Stream s ^java.io.Writer w]
  (.write w (.toString s)))

(defprotocol IEnt
  (add-triple [this triple])
  (get-created-at [this])
  (set-created-at! [this v]))

(deftype Ent [^ArrayList triples
              ^:unsynchronized-mutable ^long created-at]
  IEnt
  (add-triple [_ triple]
    (.add triples triple))
  (get-created-at [_]
    created-at)
  (set-created-at! [this v]
    (set! (.created_at this) v))
  Object
  (toString [_]
    (str "#Ent{:triples " (.size triples)
         ", :created-at " created-at "}")))

(defmethod print-method Ent [^Ent e ^java.io.Writer w]
  (.write w (.toString e)))

(defn get-schema [conn app-id]
  (-> (attr-model/get-by-app-id conn app-id)
      schema/attrs->schema
      schema/schema->defs))

(defn get-rules [conn app-id]
  (rule-model/get-by-app-id conn app-id))

(defn get-webhooks [conn app-id]
  (webhook-model/get-all-by-app-id conn app-id))

(def app-email-templates-q
  (uhsql/preformat {:select [[:t.email-type :type] :t.body :t.name :t.subject :s.email]
                    :from [[:app-email-templates :t]]
                    :join [[:app-email-senders :s] [:=
                                                    :t.sender-id
                                                    :s.id]]
                    :where [:= :t.app-id :?app-id]}))

(defn get-app-email-templates [conn app-id]
  (sql/select ::get-app-email-templates
              conn
              (uhsql/formatp app-email-templates-q {:app-id app-id})))

(defn get-storage-usage [conn app-id]
  (let [{:keys [total_byte_size]} (app-file-model/get-app-usage conn app-id)]
    total_byte_size))

(defn get-app-usage [conn app-id]
  (:num_bytes (app-model/app-usage conn {:app-id app-id})))

;; Tested different zstd compression levels. 7 seemed like the best tradeoff
;; between size and speed.
;; 3 -> 4.1mb
;; 7 -> 3.6mb
;; 9 -> 3.4mb
;; 14 -> 3.2mb
;; 22 -> 2.6mb
(def ^{:tag Integer} compression-level (int 7))

(defn complete-streams [query-conn
                        {:keys [backup-id
                                isn
                                backup-at]}
                        {:keys [streams app-id]}]
  ;; First, write the streams out
  (->> (mapv (fn [^Stream stream]
               ((.finish stream)))
             (vals streams))
       (mapv deref))
  ;; Then write out the config
  (let [schema (get-schema query-conn app-id)
        config {:counts (reduce-kv (fn [acc etype stream]
                                     (assoc acc etype (get-entity-count stream)))
                                   (sorted-map)
                                   streams)
                :tripleCount (reduce-kv (fn [acc _ stream]
                                          (+ acc (get-triple-count stream)))
                                        0
                                        streams)
                :schema schema
                :rules (:code (get-rules query-conn app-id))
                :webhooks (mapv (fn [webhook]
                                  (select-keys webhook [:namespaces :sink :status :actions]))
                                (get-webhooks query-conn app-id))
                :emailTemplates (get-app-email-templates query-conn app-id)
                :title (str (:title (app-model/get-by-id query-conn {:id app-id})))}
        ^bytes config-bytes (json/->json-bytes config)
        ba (Zstd/compress config-bytes compression-level)
        ;; Total uncompressed bytes that the client will end up with in the
        ;; zip files
        uncompressed-size (+ (alength config-bytes)
                             (reduce-kv (fn [acc _k stream]
                                          (+ acc (get-uncompressed-size stream)))
                                        0
                                        streams))]
    (s3/transfer-manager-upload (s3-transfer-manager)
                                config/s3-app-backups-bucket-name
                                {:object-key (format "%s/%s/config.json"
                                                     app-id
                                                     backup-id)
                                 :content-type "application/json"
                                 :content-encoding "zstd"
                                 :tags {:expire true}}
                                (AsyncRequestBody/fromBytes ba))

    ;; Once everything is uploaded to s3, we can insert the record into the db
    (insert-app-backup! {:id (random-uuid)
                         :app-id app-id
                         :isn isn
                         :backup-at backup-at
                         :storage-prefix (format "%s/%s"
                                                 app-id
                                                 backup-id)
                         :files-size (get-storage-usage query-conn app-id)
                         :db-size (get-app-usage query-conn app-id)
                         :uncompressed-size uncompressed-size
                         :description "Automated Daily Snapshot"
                         :expires-at (.plus (Instant/now) (Duration/ofDays 7))})))

;; Then update the db with the app backup
(defn update-entity
  "Adds triple to entities map."
  [^HashMap entities triple]
  (let [^Ent ent (if-let [ent (.get entities (:etype triple))]
                   ent
                   (let [ent (Ent. (ArrayList.) 0)]
                     (.put entities (:etype triple) ent)
                     ent))]
    (add-triple ent triple)
    (when (= "id" (:label triple))
      (set-created-at! ent (:created-at triple)))))

(defn flush-ent-triples
  "Writes triples to the JSON stream"
  [^JsonGenerator gen ^ArrayList triples]
  (loop [i 0
         state :write-field
         many-field-label nil]
    (if-let [triple (when (< i (.size triples))
                      (nth triples i))]
      (case state
        :write-field
        (do (.writeFieldName gen ^String (:label triple))
            (when (:many triple)
              (.writeStartArray gen))
            ;; We fetch the json value string-encoded from postgres
            (.writeRawValue gen ^String (:value triple))

            (if (:many triple)
              (recur (inc i)
                     :write-many
                     (:label triple))
              (recur (inc i)
                     :write-field
                     nil)))

        :write-many
        (if (not= (:label triple) many-field-label)
          (do (.writeEndArray gen)
              (recur i
                     :write-field
                     nil))
          (do
            (.writeRawValue gen ^String (:value triple))
            (recur (inc i)
                   :write-many
                   many-field-label))))
      (when (= state :write-many)
        (.writeEndArray gen)))))

(defn flush-ent
  "Writes a new json line with {entity: <ent>, createdAt: <number>}"
  [^Stream stream ^Ent ent]
  (inc-entity-count! stream)
  (add-triple-count! stream (ArrayList/.size (.triples ent)))
  (let [^JsonGenerator gen (.generator stream)]
    (.writeStartObject gen)
    (.writeFieldName gen "entity")
    (.writeStartObject gen)
    (flush-ent-triples gen (.triples ent))
    (.writeEndObject gen)
    (.writeNumberField gen "createdAt" ^long (get-created-at ent))
    (.writeEndObject gen)
    (.writeRaw gen "\n")))

(defn start-stream [backup-id app-id etype]
  (let [pipe (Pipe. (long (* 256 1024))) ;; max in-flight bytes
        sink (Okio/buffer (.sink pipe))
        source (Okio/buffer (.source pipe))
        pipe-out (.outputStream sink)
        pipe-in (.inputStream source)
        ;; Creates a long-lived upload process to s3. Once we start the first
        ;; entity for an etype, we have to keep it open until we finish the
        ;; app because we don't know where the last entity will be in the stream.
        upload-future (ua/vfuture
                       (with-open [pipe-in pipe-in]
                         (tracer/with-span! {:name "backup/upload-to-s3"
                                             :attributes {:app-id app-id
                                                          :backup-id backup-id
                                                          :etype etype}}
                           (s3/transfer-manager-upload-stream (s3-transfer-manager)
                                                              config/s3-app-backups-bucket-name
                                                              {:object-key (format "%s/%s/entities/%s.jsonl"
                                                                                   app-id
                                                                                   backup-id
                                                                                   etype)
                                                               :content-type "application/x-jsonlines"
                                                               :content-encoding "zstd"
                                                               :tags {:expire true}}
                                                              pipe-in))))
        zstd-out (doto (ZstdOutputStream. pipe-out compression-level)
                   (.setWorkers 1))
        ;; Counter sits upstream of zstd so it sees the raw JSONL bytes
        ;; written by the JsonGenerator. Knowing the raw size lets us tell
        ;; the user how much disk space the unpacked backup will take.
        counter (CountingOutputStream. zstd-out)
        gen (doto (.createGenerator (JsonFactory.) counter)
              ;; set the pretty printer so that it doesn't add
              ;; a space before subsequent json lines
              (.setPrettyPrinter (MinimalPrettyPrinter. "")))
        force-close (fn []
                      (with-open [_sink sink
                                  _counter counter
                                  _gen gen])
                      (future-cancel upload-future))
        finish (fn []
                 (.close gen)
                 (.close counter)
                 (.close pipe-out)
                 upload-future)]
    (Stream. etype
             gen
             counter
             finish
             force-close
             0
             0)))

(defn ensure-stream [backup-id app-id ^HashMap streams etype]
  (if-let [stream (get streams etype)]
    stream
    (let [stream (start-stream backup-id app-id etype)]
      (.put streams etype stream)
      stream)))

(defn flush-entities [backup-id app-id streams entities]
  (doseq [[etype ent] entities
          :let [stream (ensure-stream backup-id app-id streams etype)]]
    (flush-ent stream ent)))

(defn snapshot-datasource
  "Allows us to create a pool from a single connection.
   We get one snapshot connection to fetch attrs and rules,
   this prevents us from running two queries simultaneously
   on one connection."
  ^DataSource [^Connection conn]
  (let [lock (ReentrantLock. true)
        make (fn []
               (.lock lock)
               (Proxy/newProxyInstance
                (.getClassLoader Connection)
                (into-array Class [Connection])
                (reify InvocationHandler
                  (invoke [_ _ m args]
                    (if (= "close" (.getName m))
                      (.unlock lock)
                      (try (.invoke m conn args)
                           (catch InvocationTargetException e
                             (throw (.getCause e)))))))))]
    (reify DataSource
      (getConnection [_] (make))
      (getConnection [_ _ _] (make)))))

(defn start-upload-process
  [{:keys [process-id
           ^LinkedBlockingQueue triples-queue
           ^LinkedBlockingQueue record-progress-queue
           ^LinkedBlockingQueue flush-streams-queue
           on-done
           done-signal]}]
  (loop [triple (.take triples-queue)
         current-app-id (:app-id triple)
         current-entity-id (:entity-id triple)
         streams (HashMap.)
         ;; Map of etype -> Ent
         entities (HashMap.)
         triple-count 1]
    (cond (= triple done-signal)
          (when current-app-id
            (let [finished-promise (promise)]
              (flush-entities process-id current-app-id streams entities)
              (.put record-progress-queue {:app-id current-app-id
                                           :triple-count (dec triple-count)
                                           :finished-promise finished-promise})
              (.put flush-streams-queue
                    {:streams streams
                     :app-id current-app-id
                     :finished-promise finished-promise})))

          (not= (:app-id triple) current-app-id)
          (let [finished-promise (promise)]
            (flush-entities process-id current-app-id streams entities)
            (.put record-progress-queue {:app-id current-app-id
                                         :triple-count triple-count
                                         :finished-promise finished-promise})
            (.put flush-streams-queue
                  {:streams streams
                   :app-id current-app-id
                   :finished-promise finished-promise})
            (recur triple
                   (:app-id triple)
                   (:entity-id triple)
                   (HashMap.)
                   (HashMap.)
                   triple-count))

          (not= (:entity-id triple) current-entity-id)
          (do (flush-entities process-id current-app-id streams entities)
              (recur triple
                     current-app-id
                     (:entity-id triple)
                     streams
                     (HashMap.)
                     triple-count))

          :else
          (do (update-entity entities triple)
              (recur (.take triples-queue)
                     current-app-id
                     current-entity-id
                     streams
                     entities
                     (inc triple-count)))))
  (on-done))

(defn process []
  (let [db-config (config/get-aurora-config)
        process-id (random-uuid)
        slot-name (str "backup_" (.replace (str process-id) "-" "_"))
        {:keys [connections lsn before-ts]} (wal/create-consistent-point db-config slot-name 2)
        [^PgConnection copy-conn ^PgConnection query-conn*] connections
        query-conn (snapshot-datasource query-conn*)
        isn (instant.isn/->ISN config/invalidator-slot-num lsn)
        _ (insert-backup-job! {:id process-id
                               :isn isn
                               :backup-at before-ts
                               :machine-id config/machine-id})
        triples-queue (LinkedBlockingQueue. 50000)
        record-progress-queue (LinkedBlockingQueue.)
        flush-streams-queue (LinkedBlockingQueue. 100)
        flush-stream-process-count 100
        done-signal ::done
        copy-process (ua/vfuture
                      (with-open [conn copy-conn]
                        (doseq [triple (triples-seq conn nil)]
                          (.put triples-queue triple))
                        (.put triples-queue done-signal)))
        upload-process (ua/vfuture
                        (start-upload-process {:process-id process-id
                                               :triples-queue triples-queue
                                               :record-progress-queue record-progress-queue
                                               :flush-streams-queue flush-streams-queue
                                               :on-done (fn []
                                                          (.put record-progress-queue done-signal)
                                                          (dotimes [_ flush-stream-process-count]
                                                            (.put flush-streams-queue done-signal)))
                                               :done-signal done-signal}))
        flush-streams-processes (mapv (fn [_]
                                        (ua/vfuture
                                         (loop [item (.take flush-streams-queue)]
                                           (when (not= done-signal item)
                                             (complete-streams query-conn
                                                               {:backup-id process-id
                                                                :isn isn
                                                                :backup-at before-ts}
                                                               item)
                                             (deliver (:finished-promise item) true)
                                             (recur (.take flush-streams-queue))))))
                                      (range flush-stream-process-count))
        update-limiter (RateLimiter/create 0.2) ;; every 5 seconds
        update-progress-process (ua/vfuture
                                 (loop [item (.take record-progress-queue)
                                        app-count 1]
                                   (if (= item done-signal)
                                     (mark-backup-completed! {:id process-id})
                                     (if (and (realized? (:finished-promise item))
                                              (some-> (.peek record-progress-queue)
                                                      :finished-promise
                                                      realized?))
                                       ;; The next app is ready, so let's go straight
                                       ;; to that one
                                       (recur (.take record-progress-queue)
                                              (inc app-count))
                                       (let [{:keys [app-id triple-count finished-promise]} item]
                                         @finished-promise
                                         (update-backup-progress! {:id process-id
                                                                   :max-app-id app-id
                                                                   :triple-count triple-count
                                                                   :app-count app-count})
                                         (when (not= (.peek record-progress-queue) done-signal)
                                           (.acquire update-limiter))
                                         (recur (.take record-progress-queue)
                                                (inc app-count)))))))]
    {:copy-process copy-process
     :upload-process upload-process
     :flush-streams-processes flush-streams-processes
     :triples-queue triples-queue
     :flush-streams-queue flush-streams-queue
     :wait-for-finish (fn []
                        @copy-process
                        @upload-process
                        (doseq [p flush-streams-processes]
                          @p)
                        @update-progress-process
                        (.close query-conn*))
     :abort (fn []
              (future-cancel copy-process)
              (future-cancel upload-process)
              (doseq [p flush-streams-processes]
                (future-cancel p))
              (future-cancel update-progress-process)
              (.close query-conn*))}))
