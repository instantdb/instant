(ns instant.test-core
  (:require
   [circleci.test]
   [clj-reload.core :as reload]
   [clojure+.error]
   [clojure+.print]
   [clojure+.test]
   [instant.core :as core]
   [instant.config :as config]
   [instant.jdbc.aurora :as aurora]
   [instant.stripe :as stripe]
   [instant.system-catalog-migration :as system-catalog-migration]
   [instant.util.crypt :as crypt-util]
   [instant.util.tracer :as tracer]
   [clojure.java.io :as io]
   [clojure.tools.namespace.find :refer [find-namespaces-in-dir]]))

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

(defn test-segment [node-count node-index]
  (let [all-nses (sort (find-namespaces-in-dir (io/file "test")))
        segment-nses (keep-indexed (fn [i ns]
                                     (when (= node-index (mod i node-count))
                                       ns))
                                   all-nses)]
    (println "Testing nses:")
    (doseq [ns segment-nses]
      (println " " ns))
    (apply require :reload segment-nses)
    (let [summary (apply circleci.test/run-tests segment-nses)]
      (System/exit (+ (:error summary) (:fail summary))))))

(defn -main [& _args]
  (let [node-count (some-> (System/getenv "NODE_COUNT")
                           (Integer/parseInt))
        node-index (some-> (System/getenv "NODE_INDEX")
                           (Integer/parseInt))]
    (if (and node-count node-index)
      (test-segment node-count node-index)
      (circleci.test/dir (str ["test"])))))

(defn -main+ [_]
  (setup-teardown
   (fn []
     (clojure+.error/install!)
     (clojure+.print/install!)
     (clojure+.test/install!)
     (reload/init {:dirs ["src" "test"], :output :quieter})
     (reload/reload {:only #"instant\..*-test"})
     (clojure+.test/run))))
