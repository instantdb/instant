(ns user
  (:require
   [clj-reload.core :as reload]
   [eftest.runner :as eftest]
   [tool]))

(reload/init
 {:dirs ["src" "dev" "test"]})

(def reload
  reload/reload)

(defn test-all []
  (reload/reload {:only #"instant\..*-test"})
  (-> (reload/find-namespaces #"instant\..*-test")
      (eftest/find-tests)
      (eftest/run-tests {:multithread? false})))
