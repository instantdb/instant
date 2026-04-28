(ns instant.model.webhook
  (:require
   [instant.config :as config]
   [instant.db.model.attr :as attr-model]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.model.history :as history]
   [instant.reactive.topics :as topics]
   [instant.util.crypt :as crypt-util])
  (:import
   (java.nio ByteBuffer)
   (java.nio.charset StandardCharsets)
   (java.time Instant)))

(def ^{:tag 'bytes} period-bytes (.getBytes "." StandardCharsets/UTF_8))

(defn sign-webhook [^String body-str]
  (let [t-bytes (-> (Instant/now)
                    (.getEpochSecond)
                    str
                    (.getBytes StandardCharsets/UTF_8))
        body-bytes (.getBytes body-str StandardCharsets/UTF_8)

        buf (doto (ByteBuffer/allocate (+ (alength t-bytes)
                                          (alength period-bytes)
                                          (alength body-bytes)))
              (.put t-bytes)
              (.put period-bytes)
              (.put body-bytes))]
    (crypt-util/signature-sign (config/webhook-signing-key) (.array buf))))

(defn claim-batch!
  ([] (claim-batch! (aurora/conn-pool :write) config/machine-id))
  ([machine-id] (claim-batch! (aurora/conn-pool :write) machine-id))
  ([conn machine-id]
   (sql/execute! ::claim-batch!
                 conn
                 ["select * from claim_webhook_payloads(?)" machine-id])))

(defn uuids->labels [attrs ent]
  (persistent!
   (reduce-kv (fn [acc attr-id v]
                (if-let [label (-> attr-id
                                   parse-uuid
                                   (attr-model/seek-by-id attrs)
                                   (attr-model/fwd-label))]
                  (assoc! acc label v)
                  acc))
              (transient {})
              ent)))

(defn get-webhook-data
  "Returns a list of records:
   [{etype: <etype>
     id: <uuid>
     action: <create|update|delete>}
     before: <?ent>
     after: <?ent>]"
  ([params] (get-webhook-data (aurora/conn-pool :read) params))
  ([conn {:keys [app-id isn etypes actions]}]
   (when-let [{:keys [wal-record]} (history/get-by-app-id-and-isn conn {:isn isn
                                                                        :app-id app-id})]
     (tool/def-locals)
     (let [attrs (attr-model/get-by-app-id app-id)
           ents-after (topics/extract-entities-after wal-record)
           ents-before (topics/extract-entities-before attrs
                                                       ents-after
                                                       wal-record)]
       (concat (for [[etype ents] ents-after
                     [id ent] ents
                     :let [ent-before (get-in ents-before [etype id])
                           action (if ent-before "update" "create")]
                     :when (and (etypes etype)
                                (actions action))]
                 {:etype etype
                  :action action
                  :id id
                  :before (when (= action "update")
                            (uuids->labels attrs ent-before))
                  :after (uuids->labels attrs ent)})
               (for [[etype ents] ents-before
                     [id ent] ents
                     :when (not (get-in ents-after [etype id]))]
                 {:etype etype
                  :action "delete"
                  :id id
                  :before (uuids->labels attrs ent)
                  :after nil}))))))
