(ns instant.util.exception
  (:require
   [clojure.spec.alpha :as s]
   [clojure.string :as string]
   [clojure.walk :as w]
   [inflections.core :as inflections]
   [instant.jdbc.pgerrors :as pgerrors]
   [instant.util.json :as json :refer [<-json]]
   [instant.util.string :refer [indexes-of safe-name]]
   [instant.util.tracer :as tracer]
   [instant.util.uuid :as uuid-util])
  (:import
   (dev.cel.runtime CelEvaluationException)
   (java.io IOException)
   (org.postgresql.util PSQLException)))

;; ----
;; Spec

(s/def ::type #{::record-not-found
                ::record-expired
                ::record-not-unique
                ::record-foreign-key-invalid
                ::record-check-violation

                ::sql-raise
                ::sql-exception

                ::permission-denied
                ::permission-evaluation-failed

                ::param-missing
                ::param-malformed

                ::validation-failed
                ::operation-timed-out
                ::rate-limited
                ::parameter-limit-exceeded

                ::oauth-error

                ::session-missing
                ::socket-missing
                ::socket-error})

(s/def ::message string?)
(s/def ::trace-id string?)
(s/def ::instant-exception (s/keys :req [::type ::message ::trace-id]))

(def bad-request-types #{::record-not-found
                         ::record-expired
                         ::record-not-unique
                         ::record-foreign-key-invalid
                         ::record-check-violation
                         ::sql-raise
                         ::timeout
                         ::rate-limited

                         ::permission-denied
                         ::permission-evaluation-failed
                         ::parameter-limit-exceeded

                         ::param-missing
                         ::param-malformed

                         ::validation-failed})

(comment
  (s/explain-data ::instant-exception {::type ::record-not-found
                                       ::message "Record not found"
                                       :extra "extra"}))
;; ---------------------
;; Try / Catch Mechanism

(defn throw+
  ([instant-ex] (throw+ instant-ex nil))
  ([{:keys [::message] :as instant-ex} cause]
   (let [{:keys [trace-id]} (tracer/current-span-ids)]
     (throw (ex-info (str "[instant-exception] " message)
                     (cond-> instant-ex
                       trace-id (assoc ::trace-id trace-id))
                     cause)))))

(comment
  (throw+ {::type ::record-not-found
           ::message "hey!"}))

;; -------
;; Helpers

(defonce get-attr-details* (atom nil))

(defn define-get-attr-details
  "Allows us to access the function in attr.clj without
   creating a cyclic dependency."
  [f]
  (reset! get-attr-details* f))

(defn get-attr-details [app-id attr-id]
  (when-let [f @get-attr-details*]
    (f app-id attr-id)))

;; -------
;; Records

(defn throw-expiration-err! [record-type hint]
  (throw+ {::type ::record-expired
           ::message (format "Record expired: %s" (name record-type))
           ::hint hint}))

(defn assert-record! [record record-type hint]
  (when-not record
    (throw+ {::type ::record-not-found
             ::message (str "Record not found: " (name record-type))
             ::hint (assoc hint :record-type record-type)}))
  record)

(defn safe-char [s i]
  (when (< i (count s))
    (String/.charAt s i)))

(defn parse-unique-detail-column!
  "Returns the column at the given starting position.
   Sets `i` to the start of the next column."
  [i s]
  (let [col (StringBuffer.)
        advance (fn []
                  (vswap! i inc))
        add-char (fn [c]
                   (.append col c)
                   (advance))]
    (loop [open-parens 0
           in-quote? false]
      (let [c (safe-char s @i)]
        (if-not c
          (.toString col)
          (case c
            \, (if in-quote?
                 (do
                   (add-char c)
                   (recur open-parens
                          in-quote?))
                 (do
                   (advance)
                   ;; Consume next space
                   (advance)
                   (.toString col)))
            \) (if (pos? open-parens)
                 (do
                   (add-char c)
                   (recur (dec open-parens)
                          in-quote?))
                 (.toString col))
            \( (do
                 (add-char c)
                 (recur (inc open-parens)
                        in-quote?))
            \" (let [escaped-quote? (= (safe-char s (dec @i))
                                       \\)]
                 (add-char c)
                 (recur open-parens
                        (if escaped-quote?
                          in-quote?
                          (not in-quote?))))
            (do (add-char c)
                (recur open-parens
                       in-quote?))))))))

(defn parse-unique-detail-columns!
  "Finds the list of columns and returns them as a vector of strings.
   Sets `i` to the end of the columns.
   Given \"Key (a, b, c)=(1, 2, 3) already exists\"
   Returns [\"a\", \"b\", \"c\"] with i at the `=` char."
  [i s]
  (loop [columns []
         stage :find-columns-start]
    (let [c (safe-char s @i)]
      (if-not c
        columns
        (if (= c \))
          (do
            (vswap! i inc)
            columns)
          (case stage
            :find-columns-start (do (vswap! i inc)
                                    (if (= \( c)
                                      (recur columns
                                             :get-column)
                                      (recur columns
                                             :find-columns-start)))
            :get-column (recur (conj columns
                                     (parse-unique-detail-column! i s))
                               :get-column)))))))

(defn parse-unique-detail [s]
  (let [i (volatile! 0)
        keys (parse-unique-detail-columns! i s)
        values (parse-unique-detail-columns! i s)]
    (zipmap keys values)))

(defn- safely-extract-data [f pg-data span-name]
  (try
    (f pg-data)
    (catch Exception e
      (tracer/record-exception-span! e {:name span-name})
      nil)))

(defn extract-duplicate-ident-data [pg-data]
  (when (and (= "idents" (:table pg-data))
             (= "app_ident_uq" (:constraint pg-data)))
    (safely-extract-data
     (fn [pg-data]
       (let [details (parse-unique-detail (:detail pg-data))
             etype (get details "etype")
             label (get details "label")]
         (when (and etype label)
           {:message (format "`%s` already exists on `%s`"
                             label
                             etype)
            :hint {:etype etype
                   :label label}})))
     pg-data
     "ex/extract-duplicate-ident-data")))

(defn extract-unique-triple-data [pg-data]
  (when (and (= "triples" (:table pg-data))
             (= "av_index" (:constraint pg-data)))
    (safely-extract-data
     (fn [pg-data]
       (let [details (parse-unique-detail (:detail pg-data))
             value   (get details "json_null_to_null(value)")
             app-id  (uuid-util/coerce (get details "app_id"))
             attr-id (uuid-util/coerce (get details "attr_id"))
             {:keys [etype label]} (get-attr-details app-id attr-id)]
         (cond (and etype label value)
               {:message (format "`%s` is a unique attribute on `%s` and an entity already exists with `%s.%s` = %s"
                                 label
                                 etype
                                 etype
                                 label
                                 value)
                :hint {:attr-id attr-id
                       :etype etype
                       :label label
                       :value value}}

               attr-id
               {:hint {:attr-id attr-id
                       :value value}}

               :else nil)))
     pg-data
     "ex/extract-unique-triple-data")))

(defn build-not-unqiue-hint [pg-data]
  (or (extract-duplicate-ident-data pg-data)
      (extract-unique-triple-data pg-data)))

(defn throw-record-not-unique!
  ([record-type] (throw-record-not-unique! record-type nil nil))
  ([record-type pg-data e]
   (let [extra-hint-data (build-not-unqiue-hint pg-data)]
     (throw+ {::type ::record-not-unique
              ::message (or (:message extra-hint-data)
                            (format "Record not unique: %s" (name record-type)))
              ::hint (merge {:record-type record-type} (:hint extra-hint-data))}
             e))))

;; -----------
;; Permissions

(defn assert-permitted! [perm input pass?]
  (when-not pass?
    (throw+ {::type ::permission-denied
             ::message (format "Permission denied: not %s" (name perm))
             ::hint {:input input
                     :expected perm}}))
  pass?)

(defn throw-permission-evaluation-failed! [etype action ^CelEvaluationException e show-cel-errors?]
  (let [cause-type (.name (.getErrorCode e))
        err-message (.getMessage e)
        cause-message (if (and err-message show-cel-errors?)
                        err-message
                        "You may have a typo")
        hint-message (format "Could not evaluate permission rule for `%s.%s`. %s. Debug this in the sandbox and then update your permission rules."
                             etype
                             action
                             cause-message)]
    (throw+ {::type ::permission-evaluation-failed
             ::message hint-message
             ::hint (cond-> {:rule [etype action]}
                      cause-type (assoc :error {:type (keyword cause-type)
                                                :message hint-message
                                                :hint cause-message}))}
            e)))

;; -----------
;; Validations

(defn throw-validation-err! [input-type input errors]
  (throw+ {::type ::validation-failed
           ::message (str "Validation failed for "
                          (name input-type)
                          (when (seq errors)
                            (str
                             ": "
                             (string/join ", " (keep :message errors)))))
           ::hint {:data-type input-type
                   :input input
                   :errors errors}}))

(defn assert-valid! [input-type input errors]
  (when (seq errors)
    (throw-validation-err! input-type input errors)))

;; ------
;; Params

(defn get-param! [obj ks coercer]
  (let [param (get-in obj ks)
        _ (when-not param
            (throw+ {::type ::param-missing
                     ::message (format "Missing parameter: %s" (mapv safe-name ks))
                     ::hint {:in ks}}))
        coerced (coercer param)
        _ (when-not coerced
            (throw+ {::type ::param-malformed
                     ::message (format "Malformed parameter: %s" (mapv safe-name ks))
                     ::hint {:in ks
                             :original-input param}}))]
    coerced))

(defn get-optional-param! [obj ks coercer]
  (when-let [param (some-> obj
                           (get-in ks))]
    (if-let [coerced (coercer param)]
      coerced
      (throw+ {::type ::param-malformed
               ::message (format "Malformed parameter: %s" (mapv safe-name ks))
               ::hint {:in ks
                       :original-input param}}))))
(defn get-some-param!
  [obj list-of-paths coercer]
  (let [found-path (first (filter #(get-in obj %) list-of-paths))
        _ (when-not found-path
            (throw+ {::type ::param-missing
                     ::message (format "Missing parameter: %s" (mapv safe-name (first list-of-paths)))
                     ::hint {:in (first list-of-paths)
                             :possible-ins (rest list-of-paths)}}))

        param (get-in obj found-path)
        coerced (coercer param)
        _ (when-not coerced
            (throw+ {::type ::param-malformed
                     ::message (format "Malformed parameter: %s" (mapv safe-name found-path))
                     ::hint {:in found-path
                             :possible-ins list-of-paths
                             :original-input param}}))]
    coerced))

;; --------
;; Timeouts

(defn throw-operation-timeout! [operation-name timeout-ms]
  (throw+ {::type ::operation-timed-out
           ::message (format "Operation timed out: %s" (name operation-name))
           ::hint {:timeout-ms timeout-ms}}))

;; ----------
;; Rate limit

(defn throw-rate-limited! []
  (throw+ {::type ::rate-limited
           ::message "You're making too many requests. Please email support@instantdb.com or ask for help in the Discord."}))

;; -------
;; Sockets

(defn throw-session-missing! [sess-id]
  (throw+ {::type ::session-missing
           ::message (format "Session missing for id: %s" sess-id)
           ::hint {:sess-id sess-id}}))

(defn throw-socket-missing! [sess-id]
  (throw+ {::type ::socket-missing
           ::message (format "Socket missing for session: %s" sess-id)
           ::hint {:sess-id sess-id}}))

(defn throw-socket-error! [sess-id ^IOException io-ex]
  (throw+ {::type ::socket-missing
           ::message (format "Socket error for session: %s" sess-id)
           ::hint {:sess-id sess-id
                   :exception-message (.getMessage io-ex)}}
          io-ex))
;; ----
;; Spec

(defn- best-problem
  "Picks the most specific problem.
   We use a heuristic: we sort by `path`, `in` length, and the last element in `in`."
  [explain]
  (->> explain
       ::s/problems
       (sort-by
        (fn [{:keys [in path]}]
          [(count path) (count in) (last in)]))
       last))

(defn- ns-to-remove? [x]
  (#{"clojure.core"} (namespace x)))

(defn- walk-pred
  "explain-data returns a `pred`. To make it a bit cleaner,
   we walk it and remove the `namespace` part for common symbols and keywords"
  [pred]
  (w/postwalk
   (fn [x]
     (cond
       (and (symbol? x) (ns-to-remove? x)) (symbol (name x))
       (and (keyword? x) (ns-to-remove? x)) (keyword (name x))
       :else x))
   pred))

(defn explain->validation-errors [explain]
  (let [problem (best-problem explain)
        {:keys [in pred]} problem]
    [{:expected (walk-pred pred)
      :in in}]))

;; -----------------------
;; PSQL Exception Wrappers

(defn kw-table-name [str-table]
  (-> (or str-table "unknown")
      inflections/dasherize
      inflections/singular
      keyword
      keyword))

(comment
  (kw-table-name "app_oauth_codes"))

(defn extract-triple-from-constraint [{:keys [table detail]}]
  (when (and (= table "triples")
             detail
             (string/starts-with? detail "Failing row contains"))
    ;; The error detail looks like "Failing row contains (app_id, entity_id, ...),
    ;; so we extract all of those values by looking for what's between the commas
    (let [borders (conj (into [(string/index-of detail "(")]
                              (indexes-of detail ","))
                        (string/last-index-of detail ")"))
          ;; Skip any `,` in the value
          borders (concat (take 4 borders)
                          (take-last 9 borders))]
      (zipmap [:app-id
               :entity-id
               :attr-id
               :value
               :value-md5
               :ea
               :eav
               :av
               :ave
               :vae
               :created-at
               :checked-data-type]
              (map (fn [[start end]]
                     (string/trim (subs detail (inc start) end)))
                   (partition 2 1 borders))))))

(defn default-psql-throw! [e {:keys [condition] :as data} hint]
  (throw+ {::type ::sql-exception
           ::message (format "SQL Exception: %s" (name condition))
           ::hint hint
           ::pg-error-data data}
          e))

(def ^:dynamic *get-attr-for-exception* nil)

(defn translate-and-throw-psql-exception!
  [^PSQLException e]
  (let [{:keys [server-message condition table] :as data} (pgerrors/extract-data e)
        hint (select-keys data [:table :condition :constraint])]
    (case condition
      :unique-violation
      (throw-record-not-unique! (kw-table-name table) data e)

      :foreign-key-violation
      (throw+ {::type ::record-foreign-key-invalid
               ::message (format "Foreign Key Invalid: %s" (name condition))
               ::hint hint
               ::pg-error-data data}
              e)

      :check-violation
      (if-let [triple (extract-triple-from-constraint data)]
        (let [attr (when-let [get-attr *get-attr-for-exception*]
                     (some-> triple
                             :attr-id
                             uuid-util/coerce
                             get-attr))
              attr-name (when attr
                          (format "%s.%s"
                                  (-> attr
                                      :forward-identity
                                      second)
                                  (-> attr
                                      :forward-identity
                                      last)))
              {:keys [value truncated-value?]}
              (try
                {:value (some-> (:value triple)
                                <-json)
                 :truncated-value? false}
                (catch Exception _e
                  ;; We may get a truncated value, so just give that back to the user
                  {:value (:value triple)
                   :truncated-value? true}))
              msg (case (:constraint data)
                    "valid_value_data_type" (str "Invalid value type"
                                                 (if attr
                                                   (format " for %s." attr-name)
                                                   ".")
                                                 (when-let [data-type (:checked-data-type triple)]
                                                   (str " Value must be a " data-type
                                                        (if truncated-value?
                                                          "."
                                                          (str " but the provided value type is " (json/json-type-of-clj value) ".")))))

                    "indexed_values_are_constrained"
                    (if (= "t" (:av triple))
                      "Value is too large for a unique attribute."
                      "Value is too large for an indexed attribute.")
                    "valid_ref_value" "Linked value must be a valid uuid."

                    (format "Check Violation: %s" (name (:constraint data))))]
          (throw+ {::type ::validation-failed
                   ::message msg
                   ::hint (merge (when attr
                                   {:namespace (-> attr
                                                   :forward-identity
                                                   second)
                                    :attribute (-> attr
                                                   :forward-identity
                                                   last)})
                                 {:value value
                                  :checked-data-type (:checked-data-type triple)
                                  :attr-id (:attr-id triple)
                                  :entity-id (:entity-id triple)}
                                 (when (= (:constraint data)
                                          "indexed_values_are_constrained")
                                   {:value-too-large? true}))}))
        (throw+ {::type ::record-check-violation
                 ::message (format "Check Violation: %s" (name condition))
                 ::hint hint
                 ::pg-error-data data}
                e))

      ;; This could be other things besides a timeout,
      ;; but we don't have any way to check :/
      :query-canceled
      (throw+ {::type ::timeout
               ::message "The query took too long to complete."}
              e)

      :invalid-parameter-value
      (if (string/starts-with? (.getMessage e) "PreparedStatement can have at most")
        (throw+ {::type ::parameter-limit-exceeded
                 ::message "There are too many parameters in the transaction or query."
                 ::hint {:message "Consider batching transactions to reduce the number of writes in a single transaction."
                         :doc-urls ["https://www.instantdb.com/docs/instaml#batching-transactions"]}
                 ::pg-error-data data})
        (default-psql-throw! e data hint))

      :raise-exception
      (throw+ {::type ::sql-raise
               ::message (format "Raised Exception: %s" server-message)
               ::hint hint
               ::pg-error-data data}
              e)

      (default-psql-throw! e data hint))))

;; -----
;; Oauth

(defn throw-oauth-err!
  ([message]
   (throw-oauth-err! message nil))
  ([message cause]
   (throw+ {::type ::oauth-error
            ::message message}
           cause)))

(defn throw-missing-scope! [required-scope]
  (throw+ {::type ::permission-denied
           ::message (format "You are missing the %s scope" required-scope)
           ::hint {:required-scope required-scope}}))

;; --------
;; Wrappers

(defn find-instant-exception [^Exception e]
  (loop [cause e]
    (cond
      (::type (ex-data cause)) cause
      (nil? (.getCause cause)) nil
      :else (recur (.getCause cause)))))
