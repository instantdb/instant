(ns instant.test-core
  (:require
   [circleci.test]
   [circleci.test.report :as report]
   [circleci.test.report.junit :as junit]
   [clj-http.client :as clj-http]
   [clj-reload.core :as reload]
   [clojure+.error]
   [clojure+.print]
   [clojure+.test]
   [clojure.java.io :as io]
   [clojure.string]
   [clojure.test]
   [clojure.tools.namespace.find :refer [find-namespaces-in-dir]]
   [instant.config :as config]
   [instant.core :as core]
   [instant.jdbc.aurora :as aurora]
   [instant.stripe :as stripe]
   [instant.system-catalog-migration :as system-catalog-migration]
   [instant.util.crypt :as crypt-util]
   [instant.util.json :refer [->json <-json]]
   [instant.util.tracer :as tracer])
  (:import
   (java.io File FileNotFoundException)
   (java.time Instant)))

(defn setup-teardown
  "One-time setup before running our test suite and one-time teardown
  after the test suite completes. This is useful for expensive tasks like
  starting up DB connections"
  [test-suite-fn]
  (crypt-util/init (:aead-keyset (config/init)))
  (tracer/init)
  (aurora/start)
  (core/start)
  (system-catalog-migration/ensure-attrs-on-system-catalog-app)
  (stripe/init)
  (let [results (test-suite-fn)]
    (aurora/stop)
    (core/stop)
    results))

(defn list-files-recursively [dir]
  (let [files (file-seq (io/file dir))]
    (filter #(.isFile ^File %) files)))

(defn format-ga-message
  "Replaces newlines with %0A for multiline string output."
  [msg]
  (clojure.string/replace msg "\n" "%0A"))

(defn write-ga-message [state file-map m]
  (clojure.test/with-test-out
    (println (format "::error file=%s,line=%d::%s"
                     (get file-map (:file m))
                     (:line m)
                     (format-ga-message
                       (format "%s in %s (%s:%d)\n%sexpected: %s\n  actual: %s"
                               (case (:type m)
                                 :fail "FAIL"
                                 :error "ERROR")
                               (-> @state
                                   :testing-var
                                   meta
                                   :name)
                               (:file m)
                               (:line m)
                               (if-let [msg (:message m)]
                                 (str msg "\n")
                                 "")
                               (:expected m)
                               (:actual m)))))))

(deftype ActionsTestReporter [state file-map]
  report/TestReporter
  (default [_this _m])
  (pass [_this _m])
  (summary [_this _m])
  (begin-test-ns [_this _m])
  (end-test-ns [_this _m])
  (begin-test-var [_this m]
    (swap! state assoc :testing-var (:var m)))
  (end-test-var [_this _m]
    (swap! state dissoc :testing-var))
  (fail [_this m]
    (write-ga-message state file-map m))
  (error [_this m]
    (write-ga-message state file-map m)))

(defn actions-reporter [_config]
  (let [files (list-files-recursively "test")
        file-map (reduce (fn [acc ^File file]
                           (assoc acc
                                  (.getName file)
                                  (str "server/" (.getPath file))))
                         {}
                         files)]
    (->ActionsTestReporter (atom {}) file-map)))

(deftype TimingsReporter [state]
  report/TestReporter
  (default [_this _m])
  (pass [_this _m])
  (summary [_this _m])
  (begin-test-ns [_this _m])
  (end-test-ns [_this _m])
  (begin-test-var [_this _m])
  (end-test-var [_this m]
    (swap! state assoc (:var m) (:elapsed m)))
  (fail [_this _m])
  (error [_this _m]))

(defn timings-reporter [{:keys [timing-state]}]
  (->TimingsReporter timing-state))

(defn record-test-timings [timings-app-id timings-admin-token timings]
  (tracer/with-span! {:name "upload-test-timings"}
    (let [updated-at (.toString (Instant/now))]
      (clj-http.client/post "https://api.instantdb.com/admin/transact"
                            {:headers {"app-id" timings-app-id
                                       "Authorization" (str "Bearer " timings-admin-token)
                                       "Content-Type" "application/json"}
                             :as :json
                             :body (->json {:steps (for [[var elapsed] timings
                                                         :let [var-name (str (symbol var))
                                                               ns (str (:ns (meta var)))
                                                               name (str (:name (meta var)))]]
                                                     ["update"
                                                      "timings"
                                                      ["var" var-name]
                                                      {"namespace" ns
                                                       "name" name
                                                       "elapsed" elapsed
                                                       "updated-at" updated-at}])})}))))

(defn get-timings []
  (try
    (reduce (fn [acc row]
              (assoc acc (:var row) (:elapsed row)))
            {}
            (:timings
              (<-json (slurp "timings/timings.json") true)))
    (catch FileNotFoundException _e
      (println "no timings.json file")
      nil)))

(defn make-test-var-sort [timings]
  (fn [a b]
    (let [a (str (symbol a))
          b (str (symbol b))
          ta (get timings (str (symbol a)))
          tb (get timings (str (symbol b)))
          t-compare (compare ta tb)]
      (if (zero? t-compare)
        (compare a b)
        t-compare))))

(defn select-vars [vars]
  (let [node-count (some-> (System/getenv "NODE_COUNT")
                           (Integer/parseInt))
        node-index (some-> (System/getenv "NODE_INDEX")
                           (Integer/parseInt))]
    (if-not (and node-count node-index)
      vars
      (let [timings (get-timings)
            sort-fn (make-test-var-sort timings)
            sorted-vars (sort sort-fn vars)
            test-vars (->> (keep-indexed (fn [i ns]
                                           (when (= node-index (mod i node-count))
                                             ns))
                                         sorted-vars)
                           ;; sort to keep the vars in the same ns together
                           (sort-by #(-> % symbol str)))]
        (println "Testing vars:")
        (doseq [v test-vars]
          (println " " v))
        test-vars))))

(defn -main [& _args]
  (let [nses (find-namespaces-in-dir (io/file "test"))
        _ (apply require :reload nses)
        all-test-vars (for [ns nses
                            var (vals (ns-interns ns))
                            :when (:test (meta var))]
                        var)
        test-vars (select-vars all-test-vars)
        counters (ref clojure.test/*initial-report-counters*)
        timing-state (atom {})
        config {:global-fixture setup-teardown
                :timing-state timing-state
                :reporters [circleci.test.report/clojure-test-reporter
                            actions-reporter
                            timings-reporter
                            junit/reporter]
                :test-results-dir "target/test-results"}
        global-fixture-fn (circleci.test/make-global-fixture config)
        timings-app-id (System/getenv "INSTANT_TIMINGS_APP_ID")
        timings-admin-token (System/getenv "INSTANT_TIMINGS_ADMIN_TOKEN")
        ns-groups (group-by (comp :ns meta) test-vars)]

    (binding [clojure.test/*report-counters* counters
              clojure.test/report report/report
              report/*reporters* (#'circleci.test/get-reporters config)]
      (global-fixture-fn
       (fn []
         (doseq [[ns test-vars] ns-groups]
           (println "Testing tests in namespace" (str ns))
           (clojure.test/do-report {:type :begin-test-ns :ns ns})
           (doseq [v test-vars]
             (println "Testing" (str (symbol v)))
             (circleci.test/test-var v config))
           (clojure.test/do-report {:type :end-test-ns :ns ns}))))
      (let [summary (assoc @counters :type :summary)
            exit-code (+ (:fail summary) (:error summary))]
        (clojure.test/do-report summary)
        (when (and (zero? exit-code)
                   timings-app-id
                   timings-admin-token
                   (= "true" (System/getenv "SAVE_TIMINGS")))
          (try
            (record-test-timings timings-app-id timings-admin-token @timing-state)
            (catch Throwable t
              (println "Error saving test timings" t))))
        (System/exit exit-code)))))

(defn -main+ [_]
  (setup-teardown
    (fn []
      (clojure+.error/install!)
      (clojure+.print/install!)
      (clojure+.test/install!)
      (reload/init {:dirs ["src" "test"], :output :quieter})
      (reload/reload {:only #"instant\..*-test"})
      (clojure+.test/run))))
