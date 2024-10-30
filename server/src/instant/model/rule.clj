(ns instant.model.rule
  (:require
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

(defn put!
  ([params] (put! aurora/conn-pool params))
  ([conn {:keys [app-id code]}]
   (sql/execute-one!
    conn
    ["INSERT INTO rules (app_id, code) VALUES (?::uuid, ?::jsonb)
     ON CONFLICT (app_id) DO UPDATE SET code = excluded.code"
     app-id (->json code)])))

(defn merge!
  ([params] (merge! aurora/conn-pool params))
  ([conn {:keys [app-id code]}]
   (sql/execute-one!
    conn
    (hsql/format {:insert-into :rules
                  :values [{:app-id app-id
                            :code [:cast (->json code) :jsonb]}]
                  :on-conflict :app-id
                  :do-update-set {:code [:|| :rules.code :excluded.code]}}))))

(defn get-by-app-id
  ([params] (get-by-app-id aurora/conn-pool params))
  ([conn {:keys [app-id]}]
   (sql/select-one conn ["SELECT * FROM rules WHERE app_id = ?::uuid" app-id])))

(defn delete-by-app-id!
  ([params] (delete-by-app-id! aurora/conn-pool params))
  ([conn {:keys [app-id]}]
   (sql/do-execute!
    conn
    ["DELETE FROM rules WHERE app_id = ?::uuid" app-id])))

(defn with-binds [rule etype expr]
  (->> (get-in rule [etype "bind"])
       (partition-all 2)
       reverse
       (reduce
        (fn [body [var-name var-body]]
          (str "cel.bind(" var-name ", " var-body ", " body ")"))
        expr)))

(defn get-expr [rule etype action]
  (get-in rule [etype "allow" action]))

(defn extract [rule etype action]
  (when-let [expr (get-in rule [etype "allow" action])]
    (with-binds rule etype expr)))

(defn format-errors [etype action errors]
  (map (fn [^CelIssue cel-issue] [etype action (.getMessage cel-issue)]) errors))

(defn get-issues [etype action ^CelValidationException e]
  (format-errors etype action (.getErrors e)))

(defn default-program [etype action]
  (when (contains? system-catalog/all-etypes etype)
    (if (and (= "$users" etype)
             (= "view" action))
      (let [code "auth.id == data.id"
            ast (cel/->ast code)]
        {:etype etype
         :action action
         :code code
         :display-code code
         :cel-ast ast
         :cel-program (cel/->program ast)})
      (let [display-code (format "disallow_%s_on_system_tables" action)
            code "false"
            ast (cel/->ast code)]
        {:etype etype
         :action action
         :display-code display-code
         :code code
         :cel-ast ast
         :cel-program (cel/->program ast)}))))

(defn get-program! [rules etype action]
  (or
   (when-let [expr (get-expr (:code rules) etype action)]
     (try
       (let [code (with-binds (:code rules) etype expr)
             ast (cel/->ast code)]
         {:etype etype
          :action action
          :code code
          :display-code expr
          :cel-ast ast
          :cel-program (cel/->program ast)})
       (catch CelValidationException e
         (ex/throw-validation-err!
          :permission
          [etype action]
          (->> (.getErrors e)
               (map (fn [^CelIssue cel-issue]
                      {:message (.getMessage cel-issue)})))))))
   (default-program etype action)))

(defn $users-validation-errors
  "Only allow users to changes the `view` rules for $users, since we don't have
   a way to create or update them from transactions."
  [rules action]
  (case action
    ("create" "update" "delete")
    (when (and (not (nil? (get-in rules ["$users" "allow" action])))
               (not= (get-in rules ["$users" "allow" action])
                     "false"))
      [["$users"
        action
        (format "The $users namespace is read-only. Set `$users.allow.%s` to `\"false\"`."
                action)]])

    "view" nil))

(defn system-attribute-validation-errors
  "Don't allow users to change rules for system attrs."
  [etype action]
  (when (and (not= "$users" etype)
             (not= "$files" etype)
             (string/starts-with? etype "$"))
    [[etype
      action
      (format "The %s namespace is a reserved internal namespace that does not yet support rules."
              etype)]]))

(defn validation-errors [attrs rules]
  (->> (keys rules)
       (mapcat (fn [etype] (map (fn [action] [etype action]) ["view" "create" "update" "delete"])))
       (mapcat (fn [[etype action]]
                 (or (and (= etype "$users")
                          ($users-validation-errors rules action))
                     (system-attribute-validation-errors etype action)
                     (try
                       (when-let [expr (extract rules etype action)]
                         (let [ast (cel/->ast expr)
                               ;; create the program to see if it throws
                               _program (cel/->program ast)
                               errors (cel/validation-errors attrs ast)]
                           (when (seq errors)
                             (format-errors etype action errors))))
                       (catch CelValidationException e
                         (get-issues etype action e))))))
       (keep identity)
       (map (fn [[etype action message]]
              {:message message
               :in [etype :allow action]}))))

(comment
  (def code {"docs" {"allow" {"view" "lol"
                              "create" "true"
                              "update" "moop"}}})

  (validation-errors [] code))
