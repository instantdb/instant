(ns user
  (:require
   [clj-reload.core :as reload]
   [eftest.runner :as eftest]
   [tool]))

(reload/init
 {:dirs ["src" "dev" "test"]})

(defn reload []
  (let [{:keys [loaded] :as res} (reload/reload)]
    (when (some #(= 'instant.core %) loaded)
      (@(requiring-resolve 'instant.core/start)))
    res))

(defn test-all []
  (reload/reload {:only #"instant\..*-test"})
  (eftest/run-tests (eftest/find-tests "test") {:multithread? :namespaces}))
