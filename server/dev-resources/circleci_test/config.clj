(require
         '[circleci.test.report :as report]
         '[circleci.test.report.junit :as junit]
         '[clojure.java.io :as io]
         '[clojure.test :as test]
         '[instant.config :as config]
         '[instant.jdbc.aurora :as aurora]
         '[instant.system-catalog-migration :as system-catalog-migration]
         '[instant.util.crypt :as crypt-util]
         '[instant.util.tracer :as tracer])

(defn list-files-recursively [dir]
  (let [files (file-seq (io/file dir))]
    (filter #(.isFile %) files)))

(deftype ActionsTestReporter [file-map]
  report/TestReporter
  (default [_this _m])
  (pass [_this _m])
  (summary [_this _m])
  (begin-test-ns [_this _m])
  (end-test-ns [_this _m])
  (begin-test-var [_this _m])
  (end-test-var [_this _m])
  (fail [_this m]
    (test/with-test-out
      (println (format "::error file=%s,line=%d::Test failure"
                       (get file-map (:file m))
                       (:line m)))))
  (error [_this m]
    (test/with-test-out
      (println (format "::error file=%s,line=%d::Test error"
                       (get file-map (:file m))
                       (:line m))))))

(defn actions-reporter [_config]
  (let [files (list-files-recursively "test")
        file-map (reduce (fn [acc file]
                           (assoc acc
                                  (.getName file)
                                  (str "server/" (.getPath file))))
                         {}
                         files)]
    (->ActionsTestReporter file-map)))

(defn setup-teardown
  "One-time setup before running our test suite and one-time teardown
  after the test suite completes. This is useful for expensive tasks like
  starting up DB connections"
  [test-suite-fn]
  (let [{:keys [aead-keyset]} (config/init)]
    (crypt-util/init aead-keyset))
  (tracer/init)
  (aurora/start)
  (system-catalog-migration/ensure-attrs-on-system-catalog-app)
  (let [results (test-suite-fn)]
    (aurora/stop)
    results))

{:global-fixture setup-teardown
 :reporters [circleci.test.report/clojure-test-reporter
             actions-reporter
             junit/reporter]
 :test-results-dir "target/test-results"}
