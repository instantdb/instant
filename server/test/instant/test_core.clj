(ns instant.test-core
  (:require
   [circleci.test]
   [clj-reload.core :as reload]
   [clojure+.error]
   [clojure+.print]
   [clojure+.test]
   [instant.config :as config]
   [instant.jdbc.aurora :as aurora]
   [instant.system-catalog-migration :as system-catalog-migration]
   [instant.util.crypt :as crypt-util]
   [instant.util.tracer :as tracer]))

(defn setup-teardown
  "One-time setup before running our test suite and one-time teardown
  after the test suite completes. This is useful for expensive tasks like
  starting up DB connections"
  [test-suite-fn]
  (crypt-util/init (:aead-keyset (config/init)))
  (tracer/init)
  (aurora/start)
  (system-catalog-migration/ensure-attrs-on-system-catalog-app)
  (let [results (test-suite-fn)]
    (aurora/stop)
    results))

(defn -main [& _args]
  (circleci.test/dir (str ["test"])))

(defn -main+ [_]
  (setup-teardown
   (fn []
     (clojure+.error/install!)
     (clojure+.print/install!)
     (clojure+.test/install!)
     (reload/init {:dirs ["src" "test"], :output :quieter})
     (reload/reload {:only #"instant\..*-test"})
     (clojure+.test/run))))
