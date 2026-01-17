(ns instant.data.resolvers
  "Instant's data model makes heavy use of uuids.

   When writing tests on data, it can be a bit tough to reason about what you're
   seeing, because much of the data is just uuids.

   There are two ideas here to make playing with data easier:

   There's `resolver`, which creates handy functions for you to both
   get friendly names for a uuid, or to convert a uuid to a friendly name:

   (->uuid :movie/title) ; => #uuid \"...\"
   (->friendly #uuid \"...\") ; => :movie/title

   There's also a `transform` function, which walks any data structure,
   and replaces uuids with their friendly names."
  (:require
   [honey.sql :as hsql]
   [instant.db.model.attr :as attr-model]
   [instant.db.pg-introspect :as pg-introspect]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.db.datalog :as d]
   [instant.util.uuid :as uuid-util]
   [clojure.string :as string]
   [clojure.set :as clojure-set]
   [clojure.walk :as w]
   [instant.comment :as c]))

;; --------
;; resolver

(defn- ident->friendly-name [[_ etype label]]
  (keyword etype label))

(defn- v->friendly-name [v]
  (->> (string/split (str v) #" ")
       (map string/lower-case)
       (string/join "-")
       (str "eid-")))

(defn make-attr-resolver
  [{:keys [conn-pool] :as _db} app-id]
  (let [attrs (attr-model/get-by-app-id conn-pool app-id)
        aid->friendly-name (->> attrs
                                (map (fn [{:keys [id forward-identity]}]
                                       [id (ident->friendly-name forward-identity)]))
                                (into {}))]

    {:aid->friendly-name aid->friendly-name
     :friendly-name->aid (clojure-set/map-invert aid->friendly-name)
     :eid->friendly-name (constantly nil)
     :friendly-name->eid (constantly nil)}))

(defn make-resolver
  [{:keys [conn-pool] :as db} app-id eid-fwd-idents]
  (let [attrs (attr-model/get-by-app-id conn-pool app-id)
        aid->friendly-name (->> attrs
                                (map (fn [{:keys [id forward-identity]}]
                                       [id (ident->friendly-name forward-identity)]))
                                (into {}))

        ident-attr-ids (->> eid-fwd-idents
                            (keep
                             (fn [ident-name]
                               (attr-model/seek-by-fwd-ident-name ident-name attrs)))
                            (map :id)
                            set)

        {eid-join-rows :join-rows} (d/query
                                    {:db db
                                     :app-id app-id}
                                    [[:ea '?e ident-attr-ids]])
        eid->friendly-name (->> eid-join-rows
                                (map first)
                                (map (fn [[e _ v]]
                                       [e (v->friendly-name v)]))
                                (into {}))]

    {:aid->friendly-name aid->friendly-name
     :friendly-name->aid (clojure-set/map-invert aid->friendly-name)
     :eid->friendly-name eid->friendly-name
     :friendly-name->eid (clojure-set/map-invert eid->friendly-name)}))

(defn- make-byop-resolver
  [{:keys [conn-pool] :as _db} namespace eid-fwd-idents]
  (let [{:keys [attrs table-info]} (pg-introspect/introspect conn-pool namespace)
        aid->friendly-name (->> attrs
                                (map (fn [{:keys [id forward-identity]}]
                                       [id (ident->friendly-name forward-identity)]))
                                (into {}))

        eid-fwd-idents-map (into {} eid-fwd-idents)
        eid->friendly-name (reduce (fn [acc [table-name info]]
                                     (let [primary-key (-> info :primary-key :field)
                                           name-key (keyword (get eid-fwd-idents-map table-name))
                                           rows (sql/select conn-pool
                                                            (hsql/format {:select [primary-key name-key]
                                                                          :from (keyword table-name)}
                                                                         :quoted true))]
                                       (reduce (fn [acc row]
                                                 (let [eid (str (get row primary-key))
                                                       v (get row name-key)]
                                                   (assoc acc eid (v->friendly-name v))))
                                               acc
                                               rows)))
                                   {}
                                   table-info)]

    {:aid->friendly-name aid->friendly-name
     :friendly-name->aid (clojure-set/map-invert aid->friendly-name)
     :eid->friendly-name eid->friendly-name
     :friendly-name->eid (clojure-set/map-invert eid->friendly-name)}))

(defn make-movies-resolver
  [app-id]
  (make-resolver
   {:conn-pool (aurora/conn-pool :read)}
   app-id
   [["movie" "title"]
    ["person" "name"]]))

(defn make-zeneca-resolver
  [app-id]
  (make-resolver
   {:conn-pool (aurora/conn-pool :read)}
   app-id
   [["users" "fullName"]
    ["books" "title"]
    ["bookshelves" "name"]]))

(defn make-zeneca-byop-resolver [conn namespace]
  (make-byop-resolver
   {:conn-pool conn}
   namespace
   [["users" "fullName"]
    ["books" "title"]
    ["bookshelves" "name"]]))

(defn ->uuid
  ([r x] (->uuid r x nil))
  ([{:keys [friendly-name->aid friendly-name->eid]} x not-found]
   (or (friendly-name->aid x)
       (friendly-name->eid x)
       not-found)))

(defn ->friendly
  ([r x] (->friendly r x nil))
  ([{:keys [aid->friendly-name eid->friendly-name]} x not-found]
   (or (aid->friendly-name x)
       (aid->friendly-name (uuid-util/coerce x))
       (eid->friendly-name x)
       (eid->friendly-name (uuid-util/coerce x))
       not-found)))

;; --------
;; tranformers

(defn xf-friendly
  "Maps uuids to friendly names"
  [r x]
  (->friendly r x x))

(defn walk-friendly
  [r x]
  (w/postwalk (partial xf-friendly r) x))

;; --------
;; play

(comment
  (def z (c/zeneca-app!))
  (def z-id (:id z))
  (def r (make-zeneca-resolver z-id))
  (walk-friendly
   r
   (d/query
    {:db {:conn-pool (aurora/conn-pool :read)}
     :app-id z-id}
    [[:ea (->uuid r "eid-stepan-parunashvili")]])))
