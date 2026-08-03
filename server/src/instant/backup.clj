(ns instant.backup
  (:require
   [chime.core :as chime-core]
   [clojure.string]
   [honey.sql :as hsql]
   [instant.config :as config]
   [instant.dash.ephemeral-app :refer [ephemeral-creator]]
   [instant.db.model.attr :as attr-model]
   [instant.flags :as flags]
   [instant.grab :as grab]
   [instant.isn]
   [instant.clone :as clone]
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
   [instant.util.date :as date]
   [instant.util.defrecord :refer [defrecord-once]]
   [instant.util.hsql :as uhsql]
   [instant.util.json :as json]
   [instant.util.lang :as lang]
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
   (java.sql Connection Timestamp)
   (java.time Duration Instant Period ZonedDateTime)
   (java.util ArrayList HashMap)
   (java.util.concurrent LinkedBlockingQueue)
   (java.util.concurrent.locks ReentrantLock)
   (javax.sql DataSource)
   (okio Okio Pipe)
   (org.apache.commons.io.output CountingOutputStream)
   (org.postgresql.jdbc PgConnection PgConnection)
   (software.amazon.awssdk.core.async AsyncRequestBody)))

(defn expired?
  ([backup] (expired? (Instant/now) backup))
  ([^Instant now {:keys [expires_at]}]
   (not (.isAfter (Timestamp/.toInstant expires_at) now))))

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
   (sql/do-execute! ::mark-backup-completed!
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
                    :where [:and
                            [:= :app-id :?app-id]
                            [:> :expires-at :%now]]
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
                                     [:is-distinct-from :app.creator-id [:inline (uuid-util/coerce (:id @ephemeral-creator))]]
                                     [:= nil :a.deletion-marked-at]
                                     [:= nil :app.deletion-marked-at]
                                     (when start-app-id
                                       [:>= :t.app_id [:inline (uuid-util/coerce start-app-id)]])]
                             :order-by [[:t.app_id] [:t.entity_id] [:t.attr_id]]})
        _ (assert (= 1 (count select)) "The select query cannot have parameters")
        q (format "/*+ IndexScan(t triples_pkey) */ COPY (%s) to stdout with (format binary)"
                  (first select))
        copy-seq (copy/copy-seq conn
                                q
                                columns
                                {:row-fn ->Triple})]
    copy-seq))

(defn app-triples-seq
  "Returns a seq of triples for an app, ordered by app-id, entity-id, then attr-id"
  [^PgConnection conn app-id]
  (let [select (hsql/format {:select [:t.app_id
                                      :t.entity_id
                                      [[:cast :t.value :text] :value]
                                      :t.created_at
                                      :a.etype
                                      :a.label
                                      [[:= :a.cardinality [:inline "many"]] :many]]
                             :from [[:triples :t]]
                             :join [[:attrs :a] [:= :a.id :t.attr_id]]
                             :where [:and
                                     [:= nil :a.deletion-marked-at]
                                     [:= :t.app-id [:inline (uuid-util/coerce app-id)]]]
                             :order-by [[:t.app_id] [:t.entity_id] [:t.attr_id]]})
        _ (assert (= 1 (count select)) "The select query cannot have parameters")
        q (format "/*+ IndexScan(t triples_pkey) */ COPY (%s) to stdout with (format binary)"
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
(def ^{:tag Integer} compression-level (int 3))

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
        zstd-out (ZstdOutputStream. pipe-out compression-level)
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
         triple-count 0]
    (cond (= triple done-signal)
          (when current-app-id
            (let [finished-promise (promise)]
              (flush-entities process-id current-app-id streams entities)
              (.put record-progress-queue {:app-id current-app-id
                                           :triple-count triple-count
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

(defn process-with-snapshot []
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
        process-state (atom nil)
        abort (fn []
                (when-let [{:keys [copy-process
                                   upload-process
                                   flush-streams-processes
                                   update-progress-process]} @process-state]
                  (future-cancel copy-process)
                  (future-cancel upload-process)
                  (doseq [p flush-streams-processes]
                    (future-cancel p))
                  (future-cancel update-progress-process))
                (.close query-conn*))
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
                                             (try
                                               (complete-streams query-conn
                                                                 {:backup-id process-id
                                                                  :isn isn
                                                                  :backup-at before-ts}
                                                                 item)
                                               (deliver (:finished-promise item) true)
                                               (catch Throwable t
                                                 (deliver (:finished-promise item) t)
                                                 (abort)
                                                 (throw t)))
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
                                         (let [result @finished-promise]
                                           (when (instance? Throwable result)
                                             (throw result)))
                                         (update-backup-progress! {:id process-id
                                                                   :max-app-id app-id
                                                                   :triple-count triple-count
                                                                   :app-count app-count})
                                         (when (not= (.peek record-progress-queue) done-signal)
                                           (.acquire update-limiter))
                                         (recur (.take record-progress-queue)
                                                (inc app-count)))))))]
    (reset! process-state {:copy-process copy-process
                           :upload-process upload-process
                           :flush-streams-processes flush-streams-processes
                           :update-progress-process update-progress-process})
    {:copy-process copy-process
     :upload-process upload-process
     :flush-streams-processes flush-streams-processes
     :triples-queue triples-queue
     :flush-streams-queue flush-streams-queue
     :wait-for-finish (fn []
                        (try
                          @copy-process
                          @upload-process
                          (doseq [p flush-streams-processes]
                            @p)
                          @update-progress-process
                          (.close query-conn*)
                          (catch Throwable t
                            (abort)
                            (throw t))))
     :abort abort}))

(defn get-clone-lsn [clone-pool]
  (:lsn (sql/select-one ::clone-lsn
                        clone-pool
                        ["select aurora_volume_logical_start_lsn() as lsn"])))

(defn get-eligible-app-ids
  "Returns non-ephemeral/non-deleted app ids ordered by id, excluding any apps
   in the `:backup-skip-app-ids` flag (e.g. apps migrated to self-hosted)."
  [clone-pool]
  (let [skip-app-ids (flags/backup-skip-app-ids)]
    (map :id
         (binding [sql/*query-timeout-seconds* 600]
           (sql/select ::get-eligible
                       clone-pool
                       (hsql/format {:with [[:sums {:select [:app_id [[:sum :total] :triple_total]]
                                                    :from :attr_sketches
                                                    :group-by :app_id}]]
                                     :select [:id [[:coalesce :triple_total :0] :triple_total]]
                                     :from :apps
                                     :left-join [:sums [:= :id :app_id]]
                                     :where [:and
                                             [:is-distinct-from :creator-id (:id @ephemeral-creator)]
                                             (when (seq skip-app-ids)
                                               [:not-in :id (vec skip-app-ids)])
                                             [:= nil :deletion-marked-at]]
                                     :order-by [[:triple_total :desc]]}))))))

(defn handle-app
  "Processes a single app. Delivers the result to `finished-promise` (either
   a throwable or the {:triple-count <long>} with the number of triples)."
  [{:keys [clone-pool
           process-id
           isn
           backup-at
           app-id
           finished-promise]}]
  (try
    (let [triples-queue (LinkedBlockingQueue. 5000)
          upload-progress-queue (LinkedBlockingQueue.)
          flush-streams-queue (LinkedBlockingQueue.)
          done-signal ::done
          copy-process (ua/vfuture
                        (try
                          (with-open [conn (next.jdbc/get-connection clone-pool)]
                            (doseq [triple (app-triples-seq (.unwrap conn PgConnection) app-id)]
                              (.put triples-queue triple))
                            (.put triples-queue done-signal))
                          (catch Throwable t
                            (deliver finished-promise t)
                            (.put triples-queue done-signal)
                            (.put flush-streams-queue done-signal)
                            (throw t))))
          upload-process (ua/vfuture
                          (try
                            (start-upload-process {:process-id process-id
                                                   :triples-queue triples-queue
                                                   :record-progress-queue upload-progress-queue
                                                   :flush-streams-queue flush-streams-queue
                                                   :on-done (fn []
                                                              (.put flush-streams-queue done-signal))
                                                   :done-signal done-signal})
                            (catch Throwable t
                              (deliver finished-promise t)
                              (.put flush-streams-queue done-signal)
                              (throw t))))
          _ @copy-process
          _ @upload-process
          ;; This is a little awkward, since we'll only ever take 1 thing out of the queue,
          ;; but it allows us to use the same code as `process-with-copy`
          item (.take flush-streams-queue)]
      (if (= done-signal item)
        (when-not (realized? finished-promise)
          (deliver finished-promise {:triple-count 0}))
        (with-open [conn (next.jdbc/get-connection clone-pool)]
          (complete-streams conn
                            {:backup-id process-id
                             :isn isn
                             :backup-at backup-at}
                            item)
          (deliver finished-promise
                   {:triple-count (:triple-count (.take upload-progress-queue))}))))
    (catch Throwable t
      (deliver finished-promise t))))

(defn log-retry-queue!
  "Logs the apps that failed during a backup. Records a top-level exception
   span when the retry queue is non-empty so that it surfaces in our alerting."
  [process-id ^LinkedBlockingQueue retry-queue]
  (let [failures (vec retry-queue)]
    (if (seq failures)
      (tracer/with-new-trace-root
        (tracer/record-exception-span!
         (ex-info (format "%d app(s) failed during backup" (count failures))
                  {:process-id process-id
                   :failed-count (count failures)
                   :failed-app-ids (mapv :app-id failures)})
         {:name "backup/retry-queue-not-empty"
          :escaping? false
          :attributes {:process-id process-id
                       :failed-count (count failures)
                       :failed-app-ids (mapv :app-id failures)}}))
      (tracer/record-info! {:name "backup/retry-queue-empty"
                            :attributes {:process-id process-id}}))))

(defn process-with-clone-pool
  "Similar to process-with-copy, but creates a separate copy command per app.
   Only works on a clone, since we know that the data in the database will
   never change."
  [{:keys [clone-pool
           clone-lsn
           ^long process-count
           backup-at]}]
  (let [process-id (random-uuid)
        isn (instant.isn/->ISN config/invalidator-slot-num clone-lsn)
        _ (insert-backup-job! {:id process-id
                               :isn isn
                               :backup-at backup-at
                               :machine-id config/machine-id})
        app-ids (get-eligible-app-ids clone-pool)
        app-queue (LinkedBlockingQueue. process-count)
        record-progress-queue (LinkedBlockingQueue.)
        ;; Apps that failed during the backup. We log these at the end of the
        ;; process (see `log-retry-queue!`) but don't retry them yet.
        retry-queue (LinkedBlockingQueue.)
        done-signal ::done
        process-state (atom nil)
        abort (fn []
                (when-let [{:keys [distribute-apps-process
                                   update-progress-process
                                   handle-app-processes]} @process-state]
                  (future-cancel distribute-apps-process)
                  (doseq [p handle-app-processes]
                    (future-cancel p))
                  (future-cancel update-progress-process)))
        ;; Puts app-ids on the app queue and the record-progress-queue
        ;; when the app-queue is done, it will fulfill its promise with
        ;; the data the record-progress-queue needs. This allows the
        ;; queue to move forward so that we can restart from a failed app.
        distribute-apps-process (ua/vfuture
                                 (doseq [app-id app-ids]
                                   (let [item {:app-id app-id
                                               :finished-promise (promise)}]
                                     (.put app-queue item)
                                     (.put record-progress-queue item)))
                                 (dotimes [_ process-count]
                                   (.put app-queue done-signal))
                                 (.put record-progress-queue done-signal))
        handle-app-processes (mapv (fn [_]
                                     (ua/vfuture
                                      (loop [item (.take app-queue)]
                                        (when (not= done-signal item)
                                          (try
                                            (handle-app {:clone-pool clone-pool
                                                         :process-id process-id
                                                         :isn isn
                                                         :backup-at backup-at
                                                         :app-id (:app-id item)
                                                         :finished-promise (:finished-promise item)})
                                            (catch Throwable t
                                              (tracer/with-new-trace-root
                                                (tracer/record-exception-span! t {:name "backup/handle-app-error"}))
                                              (deliver (:finished-promise item) t)))
                                          (recur (.take app-queue))))))
                                   (range process-count))

        update-limiter (RateLimiter/create 0.2) ;; every 5 seconds
        update-progress-process (ua/vfuture
                                 (loop [item (.take record-progress-queue)
                                        app-count 1
                                        triple-count 0]
                                   (if (= item done-signal)
                                     (mark-backup-completed! {:id process-id})
                                     (let [{:keys [app-id finished-promise]} item
                                           result @finished-promise
                                           triple-count (if (instance? Throwable result)
                                                          (do
                                                            (.add retry-queue {:app-id app-id
                                                                               :error result})
                                                            triple-count)
                                                          (+ triple-count
                                                             (long (:triple-count result))))]
                                       (when (or (= (.peek record-progress-queue) done-signal)
                                                 (.tryAcquire update-limiter))
                                         (update-backup-progress! {:id process-id
                                                                   :max-app-id app-id
                                                                   :triple-count triple-count
                                                                   :app-count app-count}))
                                       (recur (.take record-progress-queue)
                                              (inc app-count)
                                              triple-count)))))]
    (reset! process-state {:distribute-apps-process distribute-apps-process
                           :update-progress-process update-progress-process
                           :handle-app-processes handle-app-processes})
    {:distribute-apps-process distribute-apps-process
     :update-progress-process update-progress-process
     :handle-app-processes handle-app-processes
     :retry-queue retry-queue
     :abort abort
     :wait-for-finish (fn []
                        (try
                          @distribute-apps-process
                          (doseq [p handle-app-processes]
                            @p)
                          @update-progress-process
                          (log-retry-queue! process-id retry-queue)
                          (catch Throwable t
                            (abort)
                            (throw t))))}))

(defn process-with-clone
  "Similar to process-with-copy, but creates a clone of the production database.
   Allows us to process multiple apps concurrently"
  [{:keys [source-cluster-id]}]
  (let [clone-config (clone/create-clone! {:instance-class "db.r8gd.xlarge"
                                           :source-cluster-id source-cluster-id})]
    (try
      (let [process-count 8
            clone-pool (clone/start-clone-pool (* 3 process-count)
                                               (:cluster-id clone-config))]
        (try
          (let [clone-lsn (get-clone-lsn clone-pool)
                backup-at (:snapshot-time clone-config)
                process (process-with-clone-pool {:clone-pool clone-pool
                                                  :process-count process-count
                                                  :clone-lsn clone-lsn
                                                  :backup-at backup-at})]
            ((:wait-for-finish process)))

          (finally
            (clone/stop-clone-pool clone-pool))))

      (finally
        (clone/delete-clone! (:cluster-id clone-config))))))

(comment
  ;; To test clone version locally against local db
  (def -process (process-with-clone-pool {:clone-pool (aurora/conn-pool :write)
                                          :clone-lsn (:lsn (sql/select-one (aurora/conn-pool :read) ["select pg_current_wal_lsn() as lsn"]))
                                          :backup-at (Instant/now)
                                          :process-count 10})))

;; Scheduled nightly backup
;;
;; Holds the state of the most recent backup run so that we can nrepl in and
;; inspect it, e.g. `@current-backup`. The `:future` is the running future;
;; deref it to block on the result or `future-cancel` it to abort.
(defonce current-backup (atom nil))

(defn daily-backup!
  "Kicks off a full clone-based backup for `date`. Runs at most once per day
   across the fleet (via `grab/run-once!`) and skips while failing over.
   The backup itself runs in a future so we don't block the scheduler; watch
   its progress with `@current-backup`."
  [^Instant date]
  (when-not (flags/failing-over?)
    (let [date-str (date/numeric-date-str (.atZone date date/pt-zone))]
      (grab/run-once!
       (str "daily-backup-" date-str)
       (fn []
         (reset! current-backup {:date date-str
                                 :started-at (Instant/now)
                                 :status :running})
         (let [fut (future
                     (tracer/with-span! {:name "backup/daily-backup"
                                         :attributes {:date date-str}}
                       (try
                         (process-with-clone {:source-cluster-id (clone/default-source-cluster-id)})
                         (swap! current-backup assoc
                                :status :completed
                                :finished-at (Instant/now))
                         (catch Throwable t
                           (tracer/record-exception-span! t {:name "backup/daily-backup-error"
                                                             :escaping? false})
                           (swap! current-backup assoc
                                  :status :failed
                                  :finished-at (Instant/now)
                                  :error t)
                           (throw t)))))]
           (swap! current-backup assoc :future fut)))))))

(defn period []
  (let [now (date/pt-now)
        eight-pm-pt (-> now
                        (.withHour 20)
                        (.withMinute 0)
                        (.withSecond 0)
                        (.withNano 0))
        periodic-seq (chime-core/periodic-seq
                      eight-pm-pt
                      (Period/ofDays 1))]
    (->> periodic-seq
         (filter (fn [x] (ZonedDateTime/.isAfter x now))))))

(defn start []
  (tracer/record-info! {:name "backup/start-daemon"})
  (def schedule
    (chime-core/chime-at (period) daily-backup!)))

(defn stop []
  (lang/close schedule))

(defn restart []
  (stop)
  (start))
