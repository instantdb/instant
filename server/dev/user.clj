(ns user
  (:require
   [clj-reload.core :as reload]
   [clojure.test :as test]
   [clojure.walk :as walk]
   [eftest.runner :as eftest])
  (:import
   [clojure.lang Compiler TaggedLiteral]))

(def p-lock
  (Object.))

(defn p-pos []
  (let [trace (->> (Thread/currentThread)
                   (.getStackTrace)
                   (seq))
        el    ^StackTraceElement (nth trace 4)]
    (str "[" (Compiler/demunge (.getClassName el)) " " (.getFileName el) ":" (.getLineNumber el) "]")))

(defn p-impl [position form res]
  (let [form (walk/postwalk
              (fn [form]
                (if (and
                     (list? form)
                     (= 'user/p-impl (first form)))
                  (TaggedLiteral/create 'p (nth form 3))
                  form))
              form)]
    (locking p-lock
      (println (str position " #p " form " => " (pr-str res))))
    res))

(defn p [form]
  `(p-impl (p-pos) '~form ~form))

(reload/init
 {:dirs ["src" "dev" "test"]})

(def reload
  reload/reload)

(defn test-all []
  (reload/reload {:only #"instant\..*-test"})
  (eftest/run-tests (eftest/find-tests "test") {:multithread? :namespaces}))
