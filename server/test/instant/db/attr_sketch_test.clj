(ns instant.db.attr-sketch-test
  (:require [clojure.test :as test :refer [deftest is testing]]
            [instant.db.attr-sketch :as cms]
            [instant.util.json :as json])
  (:import (java.math BigInteger)))

(deftest sketch-returns-counts
  (let [sketch (cms/make-sketch)
        ;; Adds 0 zeroes, 1 ones, 2 twos, etc. up to 100
        populated-sketch (reduce (fn [sketch i]
                                   (cms/add sketch nil i i))
                                 sketch
                                 (range 100))]
    (doseq [i (range 100)]
      (is (= i (cms/check populated-sketch nil i))))
    (is (= 0 (cms/check populated-sketch nil -1)))))

(deftest sketch-normalizes-dates
  (let [sketch (-> (cms/make-sketch)
                   (cms/add :date 0))]
    (is (= 1
           (cms/check sketch :date "1970-01-01T00:00:00Z")))
    (is (= 0
           (cms/check sketch :date 1)))))

(deftest sanity-check
  (let [sketch (cms/make-sketch {:confidence 0.9
                                 :error-rate 0.1})]
    (is (= 20 (:width sketch)))
    (is (= 4 (:depth sketch)))
    (is (= 80 (count (:bins sketch))))
    (is (= 0 (:total sketch)))
    (is (every? zero? (:bins sketch)))

    (is (= 1 (:total (cms/add sketch nil "val"))))))

(deftest ignores-values-we-cant-match-on
  (let [sketch (-> (cms/make-sketch)
                   (cms/add nil 1)
                   (cms/add nil {:json :data}))]
    (is (= 2 (:total sketch)))
    (is (thrown-with-msg? Exception
                          #"Invalid input"
                          (cms/check sketch nil {:json :data})))
    (is (= 1 (:total-not-binned sketch)))))

(deftest add-batch
  (let [sketch (-> (cms/make-sketch)
                   (cms/add-batch {{:value 1
                                    :checked-data-type nil} 5

                                   {:value {:json :data}
                                    :checked-data-type nil} 2

                                   {:value 0
                                    :checked-data-type :date} 4

                                   {:value "hi"
                                    :checked-data-type :string} 10}))]
    (is (= 21 (:total sketch)))

    (is (= 5 (cms/check sketch nil 1)))

    (is (= 2 (:total-not-binned sketch)))

    (is (= 4 (cms/check sketch :date 0)))

    (is (= 10 (cms/check sketch :string "hi")))

    (is (= 10 (cms/check sketch nil "hi")))))

(deftest add-nil
  (let [sketch (-> (cms/make-sketch)
                   (cms/add nil nil)
                   (cms/add nil 0)
                   (cms/add nil "")
                   (cms/add nil #uuid "0000000-0000-0000-0000-000000000000")
                   (cms/add nil false)
                   (cms/add nil true))]
    (is (= 1 (cms/check sketch nil nil)))
    (is (= 1 (cms/check sketch nil 0)))
    (is (= 1 (cms/check sketch nil "")))
    (is (= 1 (cms/check sketch nil #uuid "0000000-0000-0000-0000-000000000000")))
    (is (= 1 (cms/check sketch nil true)))
    (is (= 1 (cms/check sketch nil false)))))

(deftest the-sketch-hash-is-stable
  (let [sketch (-> (cms/make-sketch {:confidence 0.8
                                     :error-rate 0.1})
                   (cms/add nil 1)
                   (cms/add nil "1")
                   (cms/add :date 0)
                   (cms/add nil true)
                   (cms/add nil #uuid "c8ae4358-8da2-49c4-b93d-0f294e817383")
                   (cms/add nil (int 2))
                   (cms/add nil 1.8)
                   (cms/add nil {:json :value})
                   (cms/add nil nil))]
    (is (= 9 (:total sketch)))
    (is (= 1 (:total-not-binned sketch)))
    (is (= [[0 2 0 0 0 0 0 0 2 0 0 0 0 0 0 1 0 1 1 1]
            [1 0 1 0 0 2 0 1 0 0 0 0 1 0 0 1 0 0 1 0]
            [0 0 0 1 1 0 0 0 0 1 0 1 1 1 0 0 0 0 1 1]]
           (mapv vec (partition-all (:width sketch) (:bins sketch)))))))

(deftest bigints
  (testing "bigints are converted to longs if possible"
    (is (= 1 (-> (cms/make-sketch)
                 (cms/add nil (BigInteger/valueOf 10))
                 (cms/check nil 10)))))

  (testing "real bigints round-trip"
    (let [b (json/<-json  "9999999999999999999999999999999999999999999999999999999999")]
      (is (= 1 (-> (cms/make-sketch)
                   (cms/add nil b)
                   (cms/check nil b)))))))
