(ns instant.model.webhook
  (:require
   [instant.config :as config]
   [instant.db.model.attr :as attr-model]
   [instant.isn :as isn]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.model.history :as history]
   [instant.reactive.topics :as topics]
   [instant.util.cache :as cache]
   [instant.util.coll :as ucoll]
   [instant.util.crypt :as crypt-util]
   [instant.util.exception :as ex]
   [instant.util.hsql :as uhsql]
   [instant.util.uuid :as uuid-util])
  (:import
   (com.github.benmanes.caffeine.cache Cache)
   (instant.isn ISN)
   (java.nio ByteBuffer)
   (java.nio.charset StandardCharsets)
   (java.security MessageDigest)
   (java.time Instant)
   (java.util Set UUID)
   (java.util.concurrent ConcurrentHashMap)))

(def ^{:tag 'bytes} period-bytes (.getBytes "." StandardCharsets/UTF_8))

(defn sign-webhook [^String body-str]
  (let [t (-> (Instant/now)
              (.getEpochSecond)
              str)
        t-bytes (.getBytes t StandardCharsets/UTF_8)
        body-bytes (.getBytes body-str StandardCharsets/UTF_8)

        buf (doto (ByteBuffer/allocate (+ (alength t-bytes)
                                          (alength period-bytes)
                                          (alength body-bytes)))
              (.put t-bytes)
              (.put period-bytes)
              (.put body-bytes))]
    (assoc (crypt-util/signature-sign (config/webhook-signing-key) (.array buf))
           :t t)))

;; Map of attr-id -> webhook-ids, used to invalidate the webhook
;; cache if the underlying attrs change.
(def ^{:tag 'ConcurrentHashMap} attr-listeners (ConcurrentHashMap.))

(defn add-attr-listener [webhook]
  (doseq [attr-id (:id_attr_ids webhook)]
    (.compute attr-listeners attr-id (fn [_k webhook-ids]
                                       (let [^Set s (or webhook-ids
                                                        (ConcurrentHashMap/newKeySet))]
                                         (.add s {:app-id (:app_id webhook)
                                                  :webhook-id (:id webhook)})
                                         s)))))

(defn remove-attr-listener [webhook]
  (doseq [attr-id (:id_attr_ids webhook)]
    (.compute attr-listeners attr-id (fn [_k ^Set webhook-ids]
                                       (when webhook-ids
                                         (.remove webhook-ids {:app-id (:app_id webhook)
                                                               :webhook-id (:id webhook)})
                                         (when-not (.isEmpty webhook-ids)
                                           webhook-ids))))))

(def ^{:tag Cache} webhook-with-etypes-cache
  (cache/make {:max-size 2048
               :on-remove (fn [_k webhook _]
                            (remove-attr-listener webhook))}))

(defn evict-webhook-from-cache [{:keys [app-id webhook-id]}]
  (cache/invalidate webhook-with-etypes-cache {:app-id app-id
                                               :webhook-id webhook-id}))

(defn evict-webhooks-for-attr-id [attr-id]
  (doseq [params (.get attr-listeners attr-id)]
    (evict-webhook-from-cache params)))

(def get-by-app-id-and-webhook-id-q
  (uhsql/preformat {:select [:* [{:select [[[:array_agg :etype]]]
                                  :from :attrs
                                  :where [:and
                                          [:= :app_id :?app-id]
                                          [:= :id [:any :id-attr-ids]]]}
                                 :etypes]]
                    :from :webhooks
                    :where [:and
                            [:= :app_id :?app-id]
                            [:= :id :?webhook-id]]}))

(defn get-by-app-id-and-webhook-id!*
  ([params]
   (get-by-app-id-and-webhook-id!* (aurora/conn-pool :read) params))
  ([conn {:keys [app-id webhook-id]}]
   (-> (sql/select-one ::get-by-app-id-and-webhook-id!
                       conn
                       (uhsql/formatp get-by-app-id-and-webhook-id-q
                                      {:app-id app-id :webhook-id webhook-id}))
       (ex/assert-record! :webhook {:args [{:app-id app-id
                                            :webhook-id webhook-id}]}))))

(defn get-by-app-id-and-webhook-id!
  ([params]
   ;; Use this approach so that we can invalidate the webhook if the
   ;; attrs changes, since we rely on the attrs to get the etype
   ;; https://github.com/ben-manes/caffeine/wiki/Compute
   (->  webhook-with-etypes-cache
        (.asMap)
        (.computeIfAbsent params (fn [params]
                                   (let [res (get-by-app-id-and-webhook-id!* params)]
                                     (add-attr-listener res)
                                     res)))))

  ([conn params]
   (if (= conn (aurora/conn-pool :read))
     (get-by-app-id-and-webhook-id! params)
     (get-by-app-id-and-webhook-id!* params))))

(defn claim-batch!
  ([] (claim-batch! (aurora/conn-pool :write) config/machine-id))
  ([machine-id] (claim-batch! (aurora/conn-pool :write) machine-id))
  ([conn machine-id]
   (sql/execute! ::claim-batch!
                 conn
                 ["select * from claim_webhook_events(?)" machine-id])))

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

(defn record-idempotency-key
  "Creates a sha-256 hash of the inputs and generates a UUID from the first
   128 bits. Clients can use it to ensure that they don't handle the same
   record twice."
  [{:keys [^String etype ^String action ^UUID id ^ISN isn]}]
  (let [digest (MessageDigest/getInstance "SHA-256")]
    (.update digest (.getBytes etype StandardCharsets/UTF_8))
    (.update digest (.getBytes action StandardCharsets/UTF_8))
    (.update digest (uuid-util/->bytes id))
    (.update digest (isn/->bytes isn))
    (uuid-util/<-bytes (.digest digest))))

(defn payload-idempotency-key
  "Creates a sha-256 hash of the inputs and generates a UUID from the first
   128 bits. Clients can use it to ensure that they don't handle the same
   payload twice."
  [{:keys [^UUID webhook-id ^ISN isn]}]
  (let [digest (MessageDigest/getInstance "SHA-256")]
    (.update digest (uuid-util/->bytes webhook-id))
    (.update digest (isn/->bytes isn))
    (uuid-util/<-bytes (.digest digest))))

(defn webhook-data-for-isn
  "Returns a list of records:
   [{etype: <etype>
     id: <uuid>
     action: <create|update|delete>}
     before: <?ent>
     after: <?ent>]"
  ([params] (webhook-data-for-isn (aurora/conn-pool :read) params))
  ([conn {:keys [app-id isn webhook]}]
   (when-let [{:keys [wal-record]} (history/get-by-app-id-and-isn conn {:isn isn
                                                                        :app-id app-id})]
     (let [attrs (attr-model/get-by-app-id app-id)
           ents-after (topics/extract-entities-after wal-record)
           ents-before (topics/extract-entities-before attrs
                                                       ents-after
                                                       wal-record)
           etypes (fn [etype]
                    (not (nil? (ucoll/index-of etype (:etypes webhook)))))
           actions (fn [action]
                     (not (nil? (ucoll/index-of action (:actions webhook)))))]
       (concat (for [[etype ents] ents-after
                     [id ent] ents
                     :let [ent-before (get-in ents-before [etype id])
                           action (if ent-before "update" "create")]
                     :when (and (etypes etype)
                                (actions action))
                     :let [id (parse-uuid id)]]
                 {:etype etype
                  :action action
                  :id id
                  :before (when (= action "update")
                            (uuids->labels attrs ent-before))
                  :after (uuids->labels attrs ent)
                  :idempotency-key (record-idempotency-key {:etype etype
                                                            :action action
                                                            :id id
                                                            :isn isn})})
               (for [[etype ents] ents-before
                     [id ent] ents
                     :when (and (not (get-in ents-after [etype id]))
                                (etypes etype)
                                (actions "delete"))
                     :let [id (parse-uuid id)]]
                 {:etype etype
                  :action "delete"
                  :id id
                  :before (uuids->labels attrs ent)
                  :after nil
                  :idempotency-key (record-idempotency-key {:etype etype
                                                            :action "delete"
                                                            :id id
                                                            :isn isn})}))))))
