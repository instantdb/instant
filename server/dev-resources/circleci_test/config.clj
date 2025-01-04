(require
 '[circleci.test.report :as report]
 '[circleci.test.report.junit :as junit]
 '[clojure.java.io :as io]
 '[clojure.test :as test]
 '[instant.test-core :as test-core])

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

{:global-fixture test-core/setup-teardown
 :reporters [circleci.test.report/clojure-test-reporter
             actions-reporter
             junit/reporter]
 :test-results-dir "target/test-results"}
