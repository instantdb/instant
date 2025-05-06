(ns user
  (:require
   [clj-reload.core :as reload]
   [clojure+.error]
   [clojure+.hashp]
   [clojure+.print]
   [clojure+.test]
   [tool]))

(.doReset #'*warn-on-reflection* true)

(clojure+.error/install!)
(clojure+.hashp/install!)
(clojure+.print/install!)
(clojure+.test/install!)

(reload/init
 {:dirs ["src" "dev" "test"]
  :no-reload '[user]
  :output :quieter})

(def reload
  reload/reload)

(defn test-all []
  (reload/reload {:only #"instant\..*-test"})
  (clojure+.test/run))
