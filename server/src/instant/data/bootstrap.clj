(ns instant.data.bootstrap
  (:refer-clojure :exclude [namespace])
  (:require
   [honey.sql :as hsql]
   [instant.db.transaction :as tx]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [clojure.java.io :as io]
   [clojure.string :as string]
   [instant.util.json :refer [<-json ->json]]
   [instant.model.app-user :as app-user-model]
   [instant.db.model.attr :as attr-model]
   [instant.db.model.entity :as entity-model]
   [instant.db.model.triple :as triple-model]
   [instant.util.spec :as uspec])
  (:import
   (java.util UUID)))

(defn extract-zeneca-txes [{:keys [checked-data? indexed-data?]}]
  (let [imported (<-json (slurp (io/resource "sample_triples/zeneca.json")))
        triples (->> imported
                     (remove (fn [[_ a v]]
                               (or (string/starts-with? a "db/")
                                   (#{"books/industryIdentifiers"
                                      "books/dominantColor"}
                                    a)
                                   (not v)))))
        eid->uuid (->> triples
                       (map (fn [[id _ _]]
                              [id (java.util.UUID/randomUUID)]))
                       (into {}))
        triples-with-eids
        (->> triples
             (map (fn [[e a v]]
                    [(eid->uuid e)
                     a
                     (if-let [uuid (and (not= "books/title" a)
                                        (eid->uuid v))]

                       uuid
                       v)])))
        attr->uuid (->> triples
                        (map (fn [[_ a _]]
                               [a (java.util.UUID/randomUUID)]))
                        (into {}))
        triples-with-attr-ids
        (->> triples-with-eids
             (map (fn [[e a v]]
                    [e
                     (attr->uuid a)
                     v])))
        attrs-to-insert
        (->>
         attr->uuid
         (map (fn [[a uuid]]
                (let [ref? (string/starts-with? a "ref$")
                      [nsp idn] (if ref?
                                  (drop 1 (string/split a #"\$"))
                                  (string/split a #"/"))]

                  [:add-attr
                   (cond
                     ref?
                     {:id uuid
                      :forward-identity [(java.util.UUID/randomUUID) nsp idn]
                      :reverse-identity [(java.util.UUID/randomUUID) idn nsp]
                      :cardinality :many
                      :value-type :ref
                      :unique? false
                      :index? false}
                     (= "id" idn)
                     {:id uuid
                      :forward-identity [(java.util.UUID/randomUUID) nsp "id"]
                      :cardinality :one
                      :value-type :blob
                      :unique? true
                      :index? false}
                     :else
                     (merge
                      {:id uuid
                       :forward-identity [(java.util.UUID/randomUUID) nsp idn]
                       :cardinality :one
                       :value-type :blob
                       :unique? (if-not indexed-data?
                                  false
                                  (boolean (#{"email" "handle" "isbn13"} idn)))
                       :index? (if-not indexed-data?
                                 false
                                 (boolean (#{"email" "handle" "title" "order"} idn)))}
                      (when-let [data-type (when checked-data?
                                             (case idn
                                               ("email"
                                                "handle"
                                                "isbn13"
                                                "title"
                                                "fullName"
                                                "description") "string"
                                               ("order") "number"
                                               ("createdAt") "date"
                                               nil))]
                        {:checked-data-type data-type})))]))))

        triples-to-insert
        (map (fn [[e a v]]
               [:add-triple e a v])
             triples-with-attr-ids)
        txes (concat attrs-to-insert triples-to-insert)]
    (uspec/conform-throwing
     ::tx/tx-steps
     txes)

    txes))

(defn add-zeneca-to-app!
  "Bootstraps an app with zeneca data."
  ([app-id] (add-zeneca-to-app! (aurora/conn-pool :write)
                                {:checked-data? false
                                 :indexed-data? true}
                                app-id))
  ([opts app-id]
   (add-zeneca-to-app! (aurora/conn-pool :write) opts app-id))
  ([conn {:keys [checked-data? indexed-data?]} app-id]
   ;; Note: This is ugly code, but it works.
   ;; Maybe we clean it up later, but we don't really need to right now.
   ;; One idea for a cleanup, is to create an "exported app" file.
   ;; We can then write a function that works on this kind of file schema.
   (attr-model/delete-by-app-id! conn app-id)
   (let [txes (extract-zeneca-txes {:checked-data? checked-data?
                                    :indexed-data? indexed-data?})
         _ (tx/transact!
            conn
            (attr-model/get-by-app-id app-id)
            app-id
            txes)
         triples (triple-model/fetch
                  conn
                  app-id)
         attrs (attr-model/get-by-app-id conn app-id)
         users (for [[_ group] (group-by first (map :triple triples))
                     :when (= (attr-model/fwd-etype
                               (attr-model/seek-by-id (second (first group))
                                                      attrs))
                              "users")
                     :let [{:strs [email id]}
                           (entity-model/triples->map {:attrs attrs} group)]]
                 {:email email
                  :id (parse-uuid id)
                  :app-id app-id})
         created-at-triples (filter (fn [{[_e a] :triple}]
                                      (-> (attr-model/seek-by-id a attrs)
                                          attr-model/fwd-label
                                          (= "createdAt")))
                                    triples)]
     ;; Set the created_at field on the triples to the right one because
     ;; the tests rely on it.
     (doseq [{[e a v] :triple} created-at-triples
             :let [etype (attr-model/fwd-etype
                          (attr-model/seek-by-id a attrs))
                   id-attr (attr-model/seek-by-fwd-ident-name [etype "id"] attrs)]]
       (sql/execute! conn (hsql/format {:update :triples
                                        :set {:created-at (.toEpochMilli (triple-model/parse-date-value v))}
                                        :where [:and
                                                [:= :entity-id e]
                                                [:= :attr-id (:id id-attr)]
                                                [:= :value-md5 [:md5 [:cast [:cast (->json e) :json] :text]]]
                                                [:= :app-id app-id]]
                                        :returning :*})))
     (doseq [user users]
       (app-user-model/create! conn user))

     (count triples))))

(defn add-zeneca-to-byop-app!
  "Bootstraps an app with zeneca data."
  [conn]
  (let [txes (extract-zeneca-txes false)
        {:keys [add-triple add-attr]} (group-by first txes)
        attrs (map second add-attr)
        attrs-by-id (reduce (fn [acc attr]
                              (assoc acc (:id attr) attr))
                            {}
                            attrs)
        attrs-by-table (group-by (comp second :forward-identity) attrs)
        table-creates (reduce (fn [acc [table attrs]]
                                (assoc acc
                                       table
                                       {:create-table (keyword table)
                                        :with-columns (keep (fn [attr]
                                                              (let [name (-> attr
                                                                             :forward-identity
                                                                             last)
                                                                    type (cond
                                                                           (= name "id") "uuid"
                                                                           :else "jsonb")]
                                                                (if (and (not= name "id")
                                                                         (= :ref (:value-type attr)))
                                                                  ;; TODO: Handle refs
                                                                  nil
                                                                  (list* (keyword name)
                                                                         (keyword type)
                                                                         #_{:clj-kondo/ignore [:missing-else-branch]}
                                                                         (if (= name "id")
                                                                           [:primary-key])))))
                                                            attrs)}))
                              {}
                              attrs-by-table)
        add-triple-by-id (group-by second add-triple)
        entities-to-add (->> (map (fn [[_id attrs]]
                                    (reduce (fn [acc [_ _e a v]]
                                              (let [attr (get attrs-by-id a)
                                                    field (-> attr :forward-identity last keyword)]
                                                (cond-> acc
                                                  ;; TODO: handle many
                                                  true (update :columns assoc field v)
                                                  (= field :id) (assoc :table (attr-model/fwd-etype attr)))))
                                            {:table nil
                                             :columns {}}
                                            attrs))
                                  add-triple-by-id)
                             (group-by :table))]

    (doseq [table-create (vals table-creates)]
      (sql/do-execute! conn (hsql/format table-create :quoted true)))
    (doseq [[table-name entities] entities-to-add
            :let [columns (-> table-creates
                              (get table-name)
                              :with-columns)
                  q {:insert-into (keyword table-name)
                     :columns (map first columns)
                     :values (map (fn [entity]
                                    (map (fn [[col col-type]]
                                           (let [v (get-in entity [:columns col])]
                                             [:cast
                                              (case col-type
                                                :jsonb (->json v)
                                                v)
                                              col-type]))
                                         columns))
                                  entities)}]]
      (sql/do-execute! conn (hsql/format q :quoted true)))))

(defn add-movies-to-app!
  "Bootstraps an app with movies data."
  [app-id]
  ;; Note: This is ugly code, but it works.
  ;; Maybe we clean it up later, but we don't really need to right now.
  ;; One idea for a cleanup, is to create an "exported app" file.
  ;; We can then write a function that works on this kind of file schema.
  (attr-model/delete-by-app-id! (aurora/conn-pool :write) app-id)
  (let [json-triples
        (<-json (slurp (io/resource "sample_triples/movie.json")))
        id-triples
        (->> json-triples
             (group-by first)
             (map (fn [[id triples]]
                    (let [ns (-> triples
                                 first
                                 second
                                 (string/split #"/")
                                 first)]
                      [id (str ns "/" "id") id]))))
        triples (into json-triples id-triples)

        eid->uuid
        (->> triples
             (map (fn [[id _ _]]
                    [id (UUID/randomUUID)]))
             (into {}))

        triples-with-uuids
        (->> triples
             (map (fn [[e a v]]
                    [(eid->uuid e)
                     a
                     (if-let [uuid (eid->uuid v)]
                       uuid
                       v)])))

        attr->uuid (->> triples
                        (map (fn [[_ a _]]
                               [a (UUID/randomUUID)]))
                        (into {}))

        triples-with-attr-ids
        (->> triples-with-uuids
             (map (fn [[e a v]]
                    [e
                     (attr->uuid a)
                     v])))

        attrs-to-insert
        (->>
         attr->uuid
         (map (fn [[a uuid]]
                (let [ref? (#{"movie/director" "movie/cast" "movie/sequel"} a)
                      trivia? (= "trivia" a)
                      [etype label] (if trivia?
                                      ["movie" "trivia"]
                                      (string/split a #"/"))]

                  [:add-attr
                   (cond
                     ref?
                     {:id uuid
                      :forward-identity [(UUID/randomUUID) etype label]
                      :reverse-identity [(UUID/randomUUID) label etype]
                      :cardinality :many
                      :value-type :ref
                      :unique? false
                      :index? false}

                     :else
                     {:id uuid
                      :forward-identity [(UUID/randomUUID) etype label]
                      :cardinality :one
                      :value-type :blob
                      :unique? false
                      :index? false})]))))

        triples-to-insert
        (map (fn [[e a v]]
               [:add-triple e a v])
             triples-with-attr-ids)
        tx-steps (concat attrs-to-insert triples-to-insert)]

    (uspec/conform-throwing ::tx/tx-steps tx-steps)

    (tx/transact! (aurora/conn-pool :write)
                  (attr-model/get-by-app-id app-id)
                  app-id
                  tx-steps)

    (count (triple-model/fetch
            (aurora/conn-pool :read)
            app-id))))

