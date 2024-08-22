(ns instant.reactive.store-test
  (:require
   [clojure.test :as test :refer [deftest is]]
   [instant.reactive.store :as rs]))

(deftest match-topic?
  (is (true?
       (rs/match-topic?
        '[:eav _ _ _]
        '[:eav #{1} #{2} #{3}])))
  (is (true?
       (rs/match-topic?
        '[:eav #{1 2} _ _]
        '[:eav #{1} #{2} #{3}])))
  (is (false?
       (rs/match-topic?
        '[:ea #{1 2} _ _]
        '[:eav #{1} #{2} #{3}])))
  (is (false?
       (rs/match-topic?
        '[:eav #{3} _ _]
        '[:eav #{1} #{2} #{3}]))))

(comment
  (test/run-tests *ns*))
