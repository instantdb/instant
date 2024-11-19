(ns instant.util.async-test
  (:require [instant.util.async :refer [vfuture vfut-bg]]
            [clojure.test :refer [is deftest testing]]))

(deftest child-vfutures-are-canceled
  (testing "demonstrate the problem"
    (let [signal (atom nil)
          go-ahead (promise)
          v (future @(future @go-ahead (reset! signal :whoops!)))]
      (Thread/sleep 50)
      (future-cancel v)
      (Thread/sleep 50)
      (deliver go-ahead true)
      (Thread/sleep 50)
      (is (thrown? java.util.concurrent.CancellationException @v))
      (is (= :whoops! @signal))))
  (testing "demonstrate the fix"
    (let [signal (atom nil)
          go-ahead (promise)
          v (vfuture @(vfuture @go-ahead (reset! signal :whoops!)))]
      (Thread/sleep 50)
      (future-cancel v)
      (Thread/sleep 50)
      (deliver go-ahead true)
     (Thread/sleep 50)
      (is (thrown? java.util.concurrent.CancellationException @v))
      (is (= @signal nil)))))

(deftest vfut-bg-doesn't-keep-track-of-children
  (let [signal (atom nil)
        go-ahead (promise)
        v (vfut-bg @(vfuture @go-ahead (reset! signal :whoops!)))]
    (Thread/sleep 50)
    (future-cancel v)
    (Thread/sleep 50)
    (deliver go-ahead true)
    (Thread/sleep 50)
    (is (thrown? java.util.concurrent.CancellationException @v))
    (is (= :whoops! @signal))))

(deftest vfuture-in-vfut-bg-keep-track-of-children
  @(vfut-bg
     (let [signal (atom nil)
           go-ahead (promise)
           v (vfuture @(vfuture @go-ahead (reset! signal :whoops!)))]
       (Thread/sleep 50)
       (future-cancel v)
       (Thread/sleep 50)
       (deliver go-ahead true)
       (Thread/sleep 50)
       (is (thrown? java.util.concurrent.CancellationException @v))
       (is (= @signal nil)))))
