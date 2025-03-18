(ns user
  (:require
   [clj-reload.core :as reload]
   [clojure+.error]
   [clojure+.print]
   [eftest.runner :as eftest]
   [tool]))

(clojure+.print/install!)
(clojure+.error/install!)

(reload/init
 {:dirs ["src" "dev" "test"]
  :no-reload '[user]
  :output :quieter})

(def reload
  reload/reload)

(defn test-all []
  (reload/reload {:only #"instant\..*-test"})
  (-> (reload/find-namespaces #"instant\..*-test")
      (eftest/find-tests)
      (eftest/run-tests {:multithread? false})))
