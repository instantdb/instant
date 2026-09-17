(ns instant.db.query-circuit-breaker
  "Stops re-running instaql queries that keep hitting the statement timeout.

   Each (app-id, query-hash) pair has a breaker. After `failure-threshold`
   timeouts within `window-ms` the breaker opens and the query fails fast with
   the same timeout error for `open-ms`. Then one trial run is let through: a
   success closes the breaker, another timeout keeps it open for another
   `open-ms`. Configured by the `query-circuit-breaker` flag."
  (:require
   [instant.flags :as flags]
   [instant.jdbc.sql :as sql]
   [instant.util.exception :as ex]
   [instant.util.tracer :as tracer]
   [slingshot.slingshot :refer [throw+]]))

;; {[app-id query-hash] {:failures [ms ...] :opened-at ms}}
(defonce breakers (atom {}))

(defn- decide
  "Returns [new-state decision] for a request at `now`."
  [{:keys [opened-at] :as state} now {:keys [open-ms]}]
  (cond
    (nil? opened-at)
    [state :closed]

    (< (- now opened-at) open-ms)
    [state :open]

    ;; Re-arm so only this trial runs; a success closes the breaker.
    :else
    [(assoc state :opened-at now) :half-open]))

(defn check!
  "Records the request and returns :closed, :open, or :half-open."
  [key now config]
  (if (contains? @breakers key)
    (let [[old _] (swap-vals! breakers
                              (fn [m]
                                (if-let [state (get m key)]
                                  (assoc m key (first (decide state now config)))
                                  m)))]
      (second (decide (get old key) now config)))
    :closed))

(defn- recent-failures [failures now window-ms]
  (filterv #(< (- now %) window-ms) failures))

(defn- stale?
  "True when the breaker is closed and its failures fell out of the window."
  [{:keys [failures opened-at]} now {:keys [window-ms open-ms]}]
  (and (empty? (recent-failures failures now window-ms))
       (or (nil? opened-at)
           (>= (- now opened-at) open-ms))))

(defn record-timeout! [key now {:keys [failure-threshold window-ms] :as config}]
  (swap! breakers
         (fn [m]
           (let [m (into {} (remove (fn [[k state]]
                                      (and (not= k key)
                                           (stale? state now config))))
                         m)
                 failures (-> (get-in m [key :failures])
                              (recent-failures now window-ms)
                              (conj now))]
             (assoc m key (cond-> (assoc (get m key) :failures failures)
                            (>= (count failures) failure-threshold)
                            (assoc :opened-at now)))))))

(defn record-success! [key]
  (swap! breakers dissoc key))

(defn- timeout? [t start-ms]
  (and (= ::ex/timeout (::ex/type (ex-data t)))
       ;; A canceled statement raises the same error, so only count
       ;; queries that ran for about the full statement timeout.
       (>= (- (System/currentTimeMillis) start-ms)
           (* 900 sql/*query-timeout-seconds*))))

(defn- throw-open! [{:keys [open-ms]}]
  (throw+ {::ex/type ::ex/timeout
           ::ex/message "This query timed out repeatedly and is paused. It will be retried automatically."
           ::ex/hint {:circuit-breaker {:open-ms open-ms}}}))

(defn with-query-breaker
  "Runs (f) unless the breaker for this app and query is open."
  [{:keys [app-id]} query-hash f]
  (if-let [config (flags/query-circuit-breaker-config app-id)]
    (let [key [app-id query-hash]
          start (System/currentTimeMillis)
          decision (check! key start config)]
      (tracer/add-data! {:attributes {:circuit-breaker (name decision)}})
      (when (= :open decision)
        (throw-open! config))
      (let [result (try
                     (f)
                     (catch Throwable t
                       (when (timeout? t start)
                         (record-timeout! key (System/currentTimeMillis) config))
                       (throw t)))]
        (when (= :half-open decision)
          (record-success! key))
        result))
    (f)))
