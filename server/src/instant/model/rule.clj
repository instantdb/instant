(ns instant.model.rule
  (:require
   [clojure.set]
   [clojure.string :as string]
   [honey.sql :as hsql]
   [instant.db.cel :as cel]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.system-catalog :as system-catalog]
   [instant.util.cache :as cache]
   [instant.util.exception :as ex]
   [instant.util.json :refer [->json]])
  (:import
   (dev.cel.common CelIssue CelValidationException)))

(def rule-cache
  (cache/make {:max-size 512}))

(defn evict-app-id-from-cache [app-id]
  (cache/invalidate rule-cache app-id))

(defmacro with-cache-invalidation [app-id & body]
  `(do
     (evict-app-id-from-cache ~app-id)
     (let [res# ~@body]
       (evict-app-id-from-cache ~app-id)
       res#)))

(defn put!
  ([params] (put! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id code]}]
   (with-cache-invalidation app-id
     (sql/execute-one!
      ::put!
      conn
      ["INSERT INTO rules (app_id, code) VALUES (?::uuid, ?::jsonb)
          ON CONFLICT (app_id) DO UPDATE SET code = excluded.code"
       app-id (->json code)]))))

(defn merge!
  ([params] (merge! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id code]}]
   (with-cache-invalidation app-id
     (sql/execute-one!
      ::merge!
      conn
      (hsql/format {:insert-into :rules
                    :values [{:app-id app-id
                              :code [:cast (->json code) :jsonb]}]
                    :on-conflict :app-id
                    :do-update-set {:code [:|| :rules.code :excluded.code]}})))))

(defn get-by-app-id*
  ([app-id]
   (get-by-app-id* (aurora/conn-pool :read) app-id))
  ([conn app-id]
   (sql/select-one ::get-by-app-id*
                   conn ["SELECT * FROM rules WHERE app_id = ?::uuid" app-id])))

(defn get-by-app-id
  ([{:keys [app-id]}]
   (cache/get rule-cache app-id get-by-app-id*))
  ([conn {:keys [app-id]}]
   (if (or (= conn (aurora/conn-pool :read))
           (= conn (aurora/conn-pool :read-replica)))
     (get-by-app-id {:app-id app-id})
     ;; Don't cache if we're using a custom connection
     (get-by-app-id* conn app-id))))

(defn get-by-app-ids
  ([params]
   (get-by-app-ids (aurora/conn-pool :read) params))
  ([conn {:keys [app-ids]}]
   (let [rows (sql/select :get-by-app-ids
                          conn
                          (hsql/format {:select :*
                                        :from :rules
                                        :where [:= :app-id [:any (with-meta (set app-ids)
                                                                   {:pgtype "uuid[]"})]]}))
         row-by-app-id (reduce (fn [acc row]
                                 (assoc acc (:app_id row) row))
                               {}
                               rows)]
     (reduce (fn [acc app-id]
               (assoc acc app-id (get row-by-app-id app-id)))
             {}
             app-ids))))

(defn delete-by-app-id!
  ([params] (delete-by-app-id! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id]}]
   (with-cache-invalidation app-id
     (sql/do-execute!
      ::delete-by-app-id!
      conn
      ["DELETE FROM rules WHERE app_id = ?::uuid" app-id]))))

(defn bind-usages [compiler bind-keys expr]
  (clojure.set/intersection bind-keys
                            (cel/ident-usages compiler expr)))

(defn normalize-bind
  "Converts bind from either array format or object format to a flat sequence.
   Array: [k1 v1 k2 v2] -> (k1 v1 k2 v2)
   Object: {k1 v1, k2 v2} -> (k1 v1 k2 v2)"
  [bind]
  (if (map? bind)
    (mapcat identity bind)
    bind))


(defn sort-binds
  "Topological sort of binds, in order of depenency (if a -> b, then (a, b)).
   Will throw a CelValidationException if there are any cyclic deps."
  [code bind-references bind-vars]
  (let [seen (volatile! #{})
        visiting (volatile! #{})
        path (volatile! ())
        visit (fn visit [local-path v]
                (cond (contains? @seen v)
                      nil

                      (contains? @visiting v)
                      (cel/throw-cyclic-dependency-error code local-path)

                      :else
                      (do (vswap! visiting conj v)
                          (doseq [ref (get bind-references v)]
                            (visit (conj local-path ref) ref))
                          (vswap! seen conj v)
                          (vswap! path conj v))))]
    (doseq [v bind-vars]
      (visit [v] v))
    @path))

(defn with-binds [rule etype action expr]
  (let [binds (concat
               (normalize-bind (get-in rule ["$default" "bind"]))
               (normalize-bind (get-in rule [etype      "bind"])))]
    (when (not (even? (count binds)))
      (cel/throw-cel-validation-error expr "bind should have an even number of elements"))
    (if (empty? binds)
      expr
      (let [compiler (cel/action->compiler action)
            bind-map (apply hash-map binds)
            bind-keys (set (keys bind-map))

            {:keys [bind-usages
                    bind-references]}
            (loop [seen #{}
                   bind-idents #{}
                   bind-references {}
                   [next-expr & rest-expr] [{:bind-source nil
                                             :expr expr}]]
              (if-not next-expr
                {:bind-usages bind-idents
                 :bind-references bind-references}
                (let [{:keys [expr bind-source]} next-expr
                      binds (bind-usages compiler bind-keys expr)
                      new-bind-idents (clojure.set/difference binds seen)]
                  (recur (into seen binds)
                         (into bind-idents new-bind-idents)
                         (if bind-source
                           (assoc bind-references bind-source binds)
                           bind-references)
                         (concat rest-expr (map (fn [i]
                                                  {:bind-source i
                                                   :expr (get bind-map i)})
                                                new-bind-idents))))))]
        (reduce (fn [body var-name]
                  (str "cel.bind(" var-name ", " (get bind-map var-name) ", " body ")"))
                expr
                (sort-binds expr bind-references bind-usages))))))

(defn patch-code
  "Don't break if the perm check is a simple boolean"
  [code]
  (if (boolean? code) (str code) code))

(defn fallback-program [etype action]
  (when (contains? system-catalog/all-etypes etype)
    (let [compiler (cel/action->compiler action)]
      (cond
        (and (= "$users" etype)
             (#{"view" "update"} action))

        (let [code "auth.id == data.id || (data.linkedPrimaryUser != null && auth.id == data.linkedPrimaryUser)"
              ast (cel/->ast compiler code)]
          {:etype etype
           :action action
           :code code
           :display-code code
           :cel-ast ast
           :cel-program (cel/->program ast)
           :where-clauses-program (when (= action "view")
                                    (cel/where-clauses-program code))})

        (and (= "$files" etype)
             (#{"view" "update"} action))
        (let [code "false"
              ast (cel/->ast compiler code)]
          {:etype etype
           :action action
           :code code
           :display-code code
           :cel-ast ast
           :cel-program (cel/->program ast)
           :where-clauses-program (when (= action "view")
                                    (cel/where-clauses-program code))})

        :else
        (let [display-code (format "disallow_%s_on_system_tables" action)
              code "false"
              ast (cel/->ast compiler code)]
          {:etype etype
           :action action
           :display-code display-code
           :code code
           :cel-ast ast
           :cel-program (cel/->program ast)
           :where-clauses-program (when (= action "view")
                                    (cel/where-clauses-program code))})))))

(def program-cache
  (cache/make {:max-size 2048}))

;; If you load the cel ns, the deftypes will get wiped out and the
;; rules in the cache will stop working. This clears the cache when its loaded
(cel/set-afterload
 #(cache/invalidate-all program-cache))

(defn get-program!* [[{:keys [code]} {:keys [etype action paths]}]]
  (loop [paths paths]
    (when-some [[_ op-type _ & _ :as path] (first paths)]
      (or
       (case op-type
         ("allow" "fields")
         (when-some [expr (get-in code path)]
           (try
             (let [code     (with-binds code etype action (patch-code expr))
                   compiler (cel/action->compiler action)
                   ast      (cel/->ast compiler code)]
               {:etype etype
                :action action
                :code code
                :display-code expr
                :cel-ast ast
                :cel-program (cel/->program ast)
                :ref-uses (cel/collect-ref-uses ast)
                :where-clauses-program (when (and (= op-type "allow") (= action "view"))
                                         (cel/where-clauses-program code))})
             (catch CelValidationException e
               (ex/throw-validation-err!
                :permission
                (first paths)
                (->> (.getErrors e)
                     (map (fn [^CelIssue cel-issue]
                            {:message (.getMessage cel-issue)})))))))

         "fallback"
         (fallback-program etype action))
       (recur (next paths))))))

(defn get-program!
  ([rules paths]
   (cache/get program-cache [rules paths] get-program!*))
  ([rules etype action]
   (get-program!
    rules
    {:etype etype
     :action action
     :paths [[etype      "allow"    action]
             [etype      "allow"    "$default"]
             ["$default" "allow"    action]
             ["$default" "allow"    "$default"]
             [etype      "fallback" action]]})))

(defn get-field-program!
  [{:keys [code] :as rules} etype field]
  (let [path [etype "fields" field]]
    (when (some? (get-in code path))
      (when (= field "id")
        (ex/throw-validation-err!
         :permission
         path
         {:message (format "You cannot set field rules for `id`. Use %s -> allow -> view instead"
                           etype)}))
      (get-program!
       rules
       {:etype etype
        :action "view"
        :paths [path]}))))

(defn $users-validation-errors
  "Only allow users to changes the `view` and `update` rules for $users, since we don't have
   a way to create or delete them from transactions."
  [rules action]
  (case action
    ("create" "delete")
    (when (and (not (nil? (get-in rules ["$users" "allow" action])))
               (not= (get-in rules ["$users" "allow" action])
                     "false"))
      [{:message (format "The %s namespace doesn't support permissions for %s. Set `%s.allow.%s` to `\"false\"`."
                         "$users" action "$users" action)
        :in ["$users" "allow" action]}])

    ("update" "view") nil))

(defn system-attribute-validation-errors
  "Don't allow users to change rules for restricted system namespaces."
  [etype action]
  (when (and (not (#{"$users" "$files" "$default" "$rooms"} etype))
             (string/starts-with? etype "$"))
    [{:message (format "The %s namespace is a reserved internal namespace that does not yet support rules."
                       etype)
      :in [etype "allow" action]}]))

(defn bind-validation-errors [rules]
  (reduce-kv (fn [errors etype {:strs [bind]}]
               (let [bind (normalize-bind bind)
                     repeated (loop [seen #{}
                                     [var-name _body & rest] bind]
                                (if (contains? seen var-name)
                                  var-name
                                  (recur (conj seen var-name)
                                         rest)))]
                 (cond (not (even? (count bind)))
                       (conj errors
                             {:message "bind should have an even number of elements"
                              :in [etype "bind"]})

                       repeated
                       (conj errors
                             {:message "bind should only contain a given variable name once"
                              :in [etype "bind" repeated]})

                       :else errors)))
             []
             rules))

(defn extract-code [rule etype action path]
  (when-let [expr (patch-code (get-in rule path))]
    (with-binds rule etype action expr)))

(defn- format-cel-errors [path errors]
  (map (fn [^CelIssue cel-issue]
         {:message (.getMessage cel-issue)
          :in path})
       errors))

(defn- expr-validation-errors [rules {:keys [etype action path]}]
  (try
    (when-let [code (extract-code rules etype action path)]
      (let [compiler (cel/action->compiler action)
            ast (cel/->ast compiler code)
            ;; create the program to see if it throws
            _program (cel/->program ast)
            errors (cel/validation-errors compiler ast)]
        (when (seq errors)
          (format-cel-errors path errors))))
    (catch CelValidationException e
      (format-cel-errors path (.getErrors e)))
    (catch Exception _e
      [{:message "There was an unexpected error evaluating the rules"
        :in path}])))

(defn entity-rule-validation-errors [rules]
  (->> (keys rules)
       (mapcat (fn [etype] (map (fn [action] [etype action]) ["view" "create" "update" "delete"])))
       (mapcat (fn [[etype action]]
                 (or (and (= etype "$users")
                          ($users-validation-errors rules action))
                     (system-attribute-validation-errors etype action)
                     (expr-validation-errors
                      rules
                      {:etype etype
                       :action action
                       :path [etype "allow" action]}))))
       (keep identity)))

(defn field-validation-errors [rules]
  (->> (keys rules)
       (mapcat (fn [etype]
                 (->> (get-in rules [etype "fields"])
                      keys
                      (mapcat (fn [field]
                                (or
                                 (when (= field "id")
                                   [{:in [etype "fields"]
                                     :message (format "You cannot set field rules for `id`. Use %s -> allow -> view instead"
                                                      etype)}])
                                 (expr-validation-errors
                                  rules
                                  {:etype etype
                                   :action "view"
                                   :path [etype "fields" field]})))))))

       (keep identity)))

(defn room-validation-errors
  "Validates $rooms rules by building a virtual rules map for each room type
   and reusing the existing validation functions."
  [rules]
  (when-let [rooms-rules (get rules "$rooms")]
    (let [room-types (keys rooms-rules)]
      (->> room-types
           (mapcat (fn [room-type]
                     (let [virtual-rules (-> {}
                                             (assoc "$default" (get rooms-rules "$default"))
                                             (assoc room-type (get rooms-rules room-type)))]
                       (concat
                        (bind-validation-errors virtual-rules)
                        (->> (map (fn [action] [room-type action]) ["join"])
                             (mapcat (fn [[etype action]]
                                       (expr-validation-errors
                                        virtual-rules
                                        {:etype etype
                                         :action action
                                         :path [room-type "allow" action]})))
                             (keep identity))))))
           ;; Remap error paths to include "$rooms" prefix
           (map (fn [error]
                  (if (:in error)
                    (update error :in (fn [path] (into ["$rooms"] path)))
                    error)))))))

(defn get-room-program!
  "Returns a compiled CEL program for the given room type and action.
   Returns nil if no $rooms key exists in rules (backwards compat).
   Builds a virtual rules map from $rooms so we can reuse get-program!."
  [rules room-type action]
  (when-let [rooms-code (get-in rules [:code "$rooms"])]
    (let [virtual-rules {:code (-> {}
                                   (assoc "$default" (get rooms-code "$default"))
                                   (assoc room-type (get rooms-code room-type)))}]
      (get-program! virtual-rules room-type action))))

(defn validation-errors [rules]
  (let [entity-rules (dissoc rules "$rooms")]
    (concat (bind-validation-errors entity-rules)
            (entity-rule-validation-errors entity-rules)
            (field-validation-errors entity-rules)
            (room-validation-errors rules))))

(comment
  (def code {"docs" {"allow" {"view" "lol"
                              "create" "true"
                              "update" "moop"}}})

  (validation-errors code))
