#!/usr/bin/env clojure

(require 'clojure.test)
(require 'instant.config)
(require 'instant.jdbc.aurora)
(require 'instant.system-catalog-migration)
(require 'instant.util.crypt)
(require 'instant.util.tracer)
(require 'instant.storage.sweeper-test)

(defn setup-teardown
  "Setup required for tests to run properly"
  [test-suite-fn]
  (instant.util.crypt/init (:aead-keyset (instant.config/init)))
  (instant.util.tracer/init)
  (instant.jdbc.aurora/start)
  (instant.system-catalog-migration/ensure-attrs-on-system-catalog-app)
  (let [results (test-suite-fn)]
    (instant.jdbc.aurora/stop)
    results))

(println "Setting up test environment...")
(setup-teardown
 (fn []
   (println "Running sweeper tests...")
   (let [test-results (clojure.test/run-tests 'instant.storage.sweeper-test)]
     (println "\n==== SWEEPER TEST RESULTS ====")
     (println "Tests:" (:test test-results))
     (println "Assertions:" (:pass test-results))
     (println "Failures:" (:fail test-results))
     (println "Errors:" (:error test-results))
     (println "==============================")
     (System/exit (if (and (zero? (:fail test-results))
                           (zero? (:error test-results)))
                    0
                    1))))) 