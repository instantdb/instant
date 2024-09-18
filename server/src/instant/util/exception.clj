(ns instant.util.exception
  (:require [clojure.spec.alpha :as s]
            [instant.util.string :refer [safe-name]]
            [clojure.walk :as w]
            [instant.jdbc.pgerrors :as pgerrors]
            [inflections.core :as inflections])
  (:import [org.postgresql.util PSQLException]))

;; -------- 
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

                ::oauth-error

                ::session-missing
                ::socket-missing
                ::socket-error})

(s/def ::message string?)
(s/def ::instant-exception (s/keys :req [::type ::message]))

(comment
  (s/explain-data ::instant-exception {::type ::record-not-found
                                       ::message "Record not found"
                                       :extra "extra"}))
;; -------- 
;; Try / Catch Mechanism 

(defn throw+
  ([instant-ex] (throw+ instant-ex nil))
  ([{:keys [::message] :as instant-ex} cause]
   (throw (ex-info (str "[instant-exception] " message) instant-ex cause))))

(comment
  (throw+ {::type ::record-not-found
           ::message "hey!"}))

;; -------- 
;; Records 

(defn throw-expiration-err! [record-type hint]
  {::type ::record-expired
   ::message (format "Record expired: %s" (name record-type))
   ::hint hint})

(defn assert-record! [record record-type hint]
  (when-not record
    (throw+ {::type ::record-not-found
             ::message (str "Record not found: " (name record-type))
             ::hint (assoc hint :record-type record-type)}))
  record)

(defn throw-record-not-unique!
  ([record-type] (throw-record-not-unique! record-type nil))
  ([record-type e]
   (throw+ {::type ::record-not-unique
            ::message (format "Record not unique: %s" (name record-type))
            ::hint {:record-type record-type}}
           e)))

;; -------- 
;; Permissions 

(defn assert-permitted! [perm input pass?]
  (when-not pass?
    (throw+ {::type ::permission-denied
             ::message (format "Permission denied: not %s" (name perm))
             ::hint {:input input
                     :expected perm}}))
  pass?)

(defn throw-permission-evaluation-failed! [etype action e]
  (let [cause-data (-> e (.getCause) ex-data)
        cause-message (or (::message cause-data)
                          "You may have a typo")]
    (throw+ {::type ::permission-evaluation-failed
             ::message
             (format "Could not evaluate permission rule for `%s.%s`. %s. Go to the permission tab in your dashboard to update your rule."
                     etype
                     action
                     cause-message)
             ::hint (merge {:rule [etype action]}
                           (when cause-data
                             {:error {:type (keyword (name (::type cause-data)))
                                      :message (::message cause-data)
                                      :hint (::hint cause-data)}}))}
            e)))

;; ----------
;; Validations

(defn throw-validation-err! [input-type input errors]
  (throw+ {::type ::validation-failed
           ::message (format "Validation failed for %s" (name input-type))
           ::hint {:data-type input-type
                   :input input
                   :errors errors}}))

(defn assert-valid! [input-type input errors]
  (when (seq errors)
    (throw-validation-err! input-type input errors)))

;; ----------
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

;; -------- 
;; Sockets 

(defn throw-session-missing! [sess-id]
  (throw+ {::type ::session-missing
           ::message (format "Session missing for id: %s" sess-id)
           ::hint {:sess-id sess-id}}))

(defn throw-socket-missing! [sess-id]
  (throw+ {::type ::socket-missing
           ::message (format "Socket missing for session: %s" sess-id)
           ::hint {:sess-id sess-id}}))

(defn throw-socket-error! [sess-id io-ex]
  (throw+ {::type ::socket-missing
           ::message (format "Socket error for session: %s" sess-id)
           ::hint {:sess-id sess-id
                   :exception-message (.getMessage io-ex)}}
          io-ex))
;; --------- 
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

(defn translate-and-throw-psql-exception!
  [^PSQLException e]
  (let [{:keys [server-message condition table] :as data} (pgerrors/extract-data e)
        hint (select-keys data [:table :condition :constraint])]
    (condp = condition
      :unique-violation
      (throw-record-not-unique! (kw-table-name table) e)

      :foreign-key-violation
      (throw+ {::type ::record-foreign-key-invalid
               ::message (format "Foreign Key Invalid: %s" (name condition))
               ::hint hint
               ::pg-error-data data}
              e)

      :check-violation
      (throw+ {::type ::record-check-violation
               ::message (format "Check Violation: %s" (name condition))
               ::hint hint
               ::pg-error-data data}
              e)

      :raise-exception
      (throw+ {::type ::sql-raise
               ::message (format "Raised Exception: %s" server-message)
               ::hint hint
               ::pg-error-data data}
              e)

      (throw+ {::type ::sql-exception
               ::message (format "SQL Exception: %s" (name condition))
               ::hint hint
               ::pg-error-data data}
              e))))

;; --------
;; Oauth

(defn throw-oauth-err! [message]
  (throw+ {::type ::oauth-error
           ::message message}))

;; -------------
;; Wrappers

(defn find-instant-exception [^Exception e]
  (loop [cause e]
    (cond
      (::type (ex-data cause)) cause
      (nil? (.getCause cause)) nil
      :else (recur (.getCause cause)))))

