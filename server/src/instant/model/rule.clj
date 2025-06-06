(ns instant.model.rule
  (:require
   [clojure.core.cache.wrapped :as cache]
   [clojure.set]
   [clojure.string :as string]
   [honey.sql :as hsql]
   [instant.db.cel :as cel]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.system-catalog :as system-catalog]
   [instant.util.exception :as ex]
   [instant.util.json :refer [->json]])
  (:import
   (dev.cel.common CelIssue CelValidationException)))

(def rule-cache (cache/lru-cache-factory {} :threshold 256))

(defn evict-app-id-from-cache [app-id]
  (cache/evict rule-cache app-id))

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

(defn get-by-app-id* [conn app-id]
  (sql/select-one ::get-by-app-id*
                  conn ["SELECT * FROM rules WHERE app_id = ?::uuid" app-id]))

(defn get-by-app-id
  ([{:keys [app-id]}]
   (cache/lookup-or-miss rule-cache app-id (partial get-by-app-id* (aurora/conn-pool :read))))
  ([conn {:keys [app-id]}]
   ;; Don't cache if we're using a custom connection
   (get-by-app-id* conn app-id)))

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

(defn with-binds [rule etype action expr]
  (let [binds (get-in rule [etype "bind"])]
    (if (empty? binds)
      expr
      (let [compiler (cel/action->compiler action)
            bind-map (apply hash-map binds)
            bind-keys (set (keys bind-map))
            all-bind-usages (loop [seen #{}
                                   bind-idents []
                                   [next-expr & rest-expr] [expr]]
                              (if-not next-expr
                                bind-idents
                                (let [binds (bind-usages compiler bind-keys next-expr)
                                      new-bind-idents (clojure.set/difference binds seen)]
                                  (recur (into seen binds)
                                         (into bind-idents new-bind-idents)
                                         (concat rest-expr (map (fn [i]
                                                                  (get bind-map i))
                                                                new-bind-idents))))))]
        (reduce (fn [body var-name]
                  (str "cel.bind(" var-name ", " (get bind-map var-name) ", " body ")"))
                expr
                all-bind-usages)))))

(defn get-expr [rule etype action]
  (or
   (get-in rule [etype "allow" action])
   (get-in rule [etype "allow" "$default"])
   (get-in rule ["$default" "allow" action])
   (get-in rule ["$default" "allow" "$default"])))

(defn patch-code
  "Don't break if the perm check is a simple boolean"
  [code]
  (if (boolean? code) (str code) code))

(defn extract [rule etype action]
  (when-let [expr (patch-code (get-in rule [etype "allow" action]))]
    (with-binds rule etype action expr)))

(defn format-errors [etype action errors]
  (map (fn [^CelIssue cel-issue]
         {:message (.getMessage cel-issue)
          :in [etype :allow action]})
       errors))

(defn get-issues [etype action ^CelValidationException e]
  (format-errors etype action (.getErrors e)))

(defn default-program [etype action]
  (when (contains? system-catalog/all-etypes etype)
    (let [compiler (cel/action->compiler action)]
      (if (and (= "$users" etype)
               (= "view" action))
        (let [code "auth.id == data.id"
              ast (cel/->ast compiler code)]
          {:etype etype
           :action action
           :code code
           :display-code code
           :cel-ast ast
           :cel-program (cel/->program ast)
           :where-clauses-program (cel/where-clauses-program code)})
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

(def program-cache (cache/lru-cache-factory {} :threshold 2048))

;; If you load the cel ns, the deftypes will get wiped out and the
;; rules in the cache will stop working. This clears the cache when its loaded
(cel/set-afterload (fn []
                     (reset! program-cache
                             @(cache/lru-cache-factory {} :threshold 2048))))

(defn get-program!* [rules etype action]
  (or
   (when-let [expr (get-expr (:code rules) etype action)]
     (try
       (let [code (with-binds (:code rules) etype action (patch-code expr))
             compiler (cel/action->compiler action)
             ast (cel/->ast compiler code)]
         {:etype etype
          :action action
          :code code
          :display-code expr
          :cel-ast ast
          :cel-program (cel/->program ast)
          :ref-uses (cel/collect-ref-uses ast)
          :where-clauses-program (when (= action "view")
                                   (cel/where-clauses-program code))})
       (catch CelValidationException e
         (ex/throw-validation-err!
          :permission
          [etype action]
          (->> (.getErrors e)
               (map (fn [^CelIssue cel-issue]
                      {:message (.getMessage cel-issue)})))))))
   (default-program etype action)))

(defn get-program! [rules etype action]
  (cache/lookup-or-miss program-cache [rules etype action] (fn [[rules etype action]]
                                                             (get-program!* rules etype action))))

(defn $users-validation-errors
  "Only allow users to changes the `view` rules for $users, since we don't have
   a way to create or update them from transactions."
  [rules action]
  (case action
    ("create" "update" "delete")
    (when (and (not (nil? (get-in rules ["$users" "allow" action])))
               (not= (get-in rules ["$users" "allow" action])
                     "false"))
      [{:message (format "The %s namespace is read-only. Set `%s.allow.%s` to `\"false\"`."
                         "$users" "$users" action)
        :in ["$users" :allow action]}])

    "view" nil))

(defn system-attribute-validation-errors
  "Don't allow users to change rules for restricted system namespaces."
  [etype action]
  (when (and (not (#{"$users" "$files" "$default"} etype))
             (string/starts-with? etype "$"))
    [{:message (format "The %s namespace is a reserved internal namespace that does not yet support rules."
                       etype)
      :in [etype :allow action]}]))

(defn bind-validation-errors [rules]
  (reduce-kv (fn [errors etype {:strs [bind]}]
               (let [repeated (loop [seen #{}
                                     [var-name _body & rest] bind]
                                (if (contains? seen var-name)
                                  var-name
                                  (recur (conj seen var-name)
                                         rest)))]
                 (cond (not (even? (count bind)))
                       (conj errors
                             {:message "bind should have an even number of elements"
                              :in [etype :bind]})

                       repeated
                       (conj errors
                             {:message "bind should only contain a given variable name once"
                              :in [etype :bind repeated]}))))
             []
             rules))

(defn rule-validation-errors [rules]
  (->> (keys rules)
       (mapcat (fn [etype] (map (fn [action] [etype action]) ["view" "create" "update" "delete"])))
       (mapcat (fn [[etype action]]
                 (or (and (= etype "$users")
                          ($users-validation-errors rules action))
                     (system-attribute-validation-errors etype action)
                     (try
                       (when-let [expr (extract rules etype action)]
                         (let [compiler (cel/action->compiler action)
                               ast (cel/->ast compiler expr)
                               ;; create the program to see if it throws
                               _program (cel/->program ast)
                               errors (cel/validation-errors compiler ast)]
                           (when (seq errors)
                             (format-errors etype action errors))))
                       (catch CelValidationException e
                         (get-issues etype action e))
                       (catch Exception _e
                         [{:message "There was an unexpected error evaluating the rules"
                           :in [etype :allow action]}])))))
       (keep identity)))

(defn validation-errors [rules]
  (concat (bind-validation-errors rules)
          (rule-validation-errors rules)))

(comment
  (def code {"docs" {"allow" {"view" "lol"
                              "create" "true"
                              "update" "moop"}}})

  (validation-errors code))
