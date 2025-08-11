(ns instant.util.test
  (:require
   [clojure.set :as set]
   [clojure+.walk :as walk]
   [instant.db.datalog :as d]
   [instant.db.instaql :as iq]
   [instant.db.model.attr :as attr-model]
   [instant.db.model.triple :as triple-model]
   [instant.db.transaction :as tx]
   [instant.jdbc.aurora :as aurora]
   [instant.model.rule :as rule-model]
   [instant.util.exception :as ex]
   [instant.util.instaql :refer [instaql-nodes->object-tree]])
  (:import
   (java.time Duration Instant)))

(defmacro instant-ex-data [& body]
  `(try
     ~@body
     (catch Exception e#
       (let [instant-ex# (ex/find-instant-exception e#)]
         (ex-data instant-ex#)))))

(defn pretty-perm-q [{:keys [app-id current-user]} q]
  (let [attrs (attr-model/get-by-app-id app-id)]
    (walk/keywordize-keys
     (instaql-nodes->object-tree
      {:attrs attrs}
      (iq/permissioned-query
       {:db {:conn-pool (aurora/conn-pool :read)}
        :app-id app-id
        :attrs attrs
        :datalog-query-fn d/query
        :current-user current-user}
       q)))))

(defn wait-for [wait-fn wait-ms]
  (let [start (Instant/now)]
    (loop [res (wait-fn)]
      (when-not res
        (if (< wait-ms (.toMillis (Duration/between start (Instant/now))))
          (throw (Exception. "Timed out in wait-for"))
          (do
            (Thread/sleep 100)
            (recur (wait-fn))))))))

(defn make-ctx [app-id {:keys [rw]
                        :or {rw :read}}]
  {:db               {:conn-pool (aurora/conn-pool rw)}
   :app-id           app-id
   :attrs            (attr-model/get-by-app-id app-id)
   :datalog-query-fn d/query
   :rules            (rule-model/get-by-app-id (aurora/conn-pool :read) {:app-id app-id})
   :current-user     nil})

(defn make-attrs
  "Makes attrs from short description like:

     [:A/id :unique? :index?]

   Will become:

     namespace   'A'
     ident       'id'
     type        blob
     cardinality one
     unique?     true
     index?      true

   Or a ref:

     [[:B/c :C/bs] :many :unique? :on-delete-reverse]

   Will become B → C ref

     namespace         'B'
     ident             'c'
     reverse ns        'C'
     reverse ident     'bs'
     type              ref
     cardinality       many
     unique?           true
     index?            false
     on-delete-reverse :cascade

  Returns map attr->attr-id"
  [app-id attrs]
  (let [attrs (for [attr attrs
                    :let [[id & rest] attr
                          [fwd rvr]   (if (vector? id) id [id nil])]]
                (reduce
                 (fn [m k]
                   (case k
                     :many              (assoc m :cardinality :many)
                     :unique?           (assoc m :unique? true)
                     :index?            (assoc m :index? true)
                     :required?         (assoc m :required? true)
                     :on-delete         (assoc m :on-delete :cascade)
                     :on-delete-reverse (assoc m :on-delete-reverse :cascade)))
                 {:id               (random-uuid)
                  :forward-identity [(random-uuid) (namespace fwd) (name fwd)]
                  :reverse-identity (when rvr
                                      [(random-uuid) (namespace rvr) (name rvr)])
                  :value-type       (if rvr :ref :blob)
                  :cardinality      :one
                  :unique?          false
                  :index?           false
                  :required?        false}
                 rest))]
    (attr-model/insert-multi! (aurora/conn-pool :write) app-id attrs {})
    (into {}
          (for [attr attrs
                :let [[_ ns n] (:forward-identity attr)]]
            [(keyword ns n) (:id attr)]))))

(defn insert-entities
  "Insert entities in more human-readable form (attrs by their ns/ident value,
   not by attr-id). All entities must have :db/id presudo-attr:

     (insert-entities app-id attr->id
       [{:db/id       (suid \"a\")
         :user/name   \"Leo Tolstoy\"
        {:db/id       (suid \"b\")
         :book/title  \"War and Peace\"
         :book/author (suid \"a\")}])"
  [app-id attr->id entities]
  (tx/transact!
   (aurora/conn-pool :write)
   (attr-model/get-by-app-id app-id)
   app-id
   (for [entity entities
         :let   [id (:db/id entity)]
         [a v]  (dissoc entity :db/id)
         :let   [attr (attr->id a)]
         v      (if (sequential? v) v [v])]
     [:add-triple id attr v])))

(defn find-entities-by-ids
  "Finds entities by ids. Converts attr-ids to attribute keywords, adds :db/id"
  [app-id attr->id ids]
  (let [id->attr (set/map-invert attr->id)
        id->entities (reduce
                      (fn [m {:keys [triple]}]
                        (let [[e aid v] triple
                              a (id->attr aid)]
                          (update m e assoc a v)))
                      {}
                      (triple-model/fetch
                       (aurora/conn-pool :read)
                       app-id
                       [[:in :entity-id ids]]))]
    (reduce-kv
     (fn [acc id entity]
       (conj acc (assoc entity :db/id id)))
     #{} id->entities)))

(defn find-entids-by-ids
  "Finds entities by ids. Converts attr-ids to attribute keywords, adds :db/id"
  [app-id attr->id ids]
  (into #{} (map :db/id) (find-entities-by-ids app-id attr->id ids)))

(defn suid
  "Short uuid, can just specify prefix, rest will be filled with 0s

     (suid \"123\") ; => #uuid \"12300000-0000-0000-0000-000000000000\""
  [s]
  (parse-uuid
    (str s (subs "00000000-0000-0000-0000-000000000000" (count s)))))

(defmacro perm-err? [& body]
  `(try
     ~@body
     false
     (catch Exception e#
       (let [instant-ex# (ex/find-instant-exception e#)]
         (if (= ::ex/permission-denied (::ex/type (ex-data instant-ex#)))
           true
           (throw e#))))))

(defmacro validation-err? [& body]
  `(try
     ~@body
     false
     (catch Exception e#
       (let [instant-ex# (ex/find-instant-exception e#)]
         (if (= ::ex/validation-failed (::ex/type (ex-data instant-ex#)))
           true
           (throw e#))))))
