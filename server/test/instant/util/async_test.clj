(ns instant.util.async-test
  (:require [instant.util.async :refer [vfuture vfut-bg tracked-future severed-vfuture]]
            [clojure.test :refer [is deftest testing]]))

(deftest vfuture-works
  (is (= 1 @(vfuture 1))))

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
      (is (= @signal nil))))
  (testing "works with multiple levels fix"
    (let [signal (atom nil)
          go-ahead (promise)
          v (vfuture
              @(vfuture
                 @(vfuture
                    @(vfuture
                       @(vfuture @go-ahead (reset! signal :whoops!))))))]
      (Thread/sleep 50)
      (future-cancel v)
      (Thread/sleep 50)
      (deliver go-ahead true)
      (Thread/sleep 50)
      (is (thrown? java.util.concurrent.CancellationException @v))
      (is (= @signal nil)))))

(deftest child-tracked-futures-are-canceled
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
          v (tracked-future @(tracked-future @go-ahead (reset! signal :whoops!)))]
      (Thread/sleep 50)
      (future-cancel v)
      (Thread/sleep 50)
      (deliver go-ahead true)
      (Thread/sleep 50)
      (is (thrown? java.util.concurrent.CancellationException @v))
      (is (= @signal nil))))
  (testing "works with multiple levels fix"
    (let [signal (atom nil)
          go-ahead (promise)
          v (tracked-future
              @(tracked-future
                 @(tracked-future
                    @(tracked-future
                       @(tracked-future @go-ahead (reset! signal :whoops!))))))]
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

(deftest severed-vfuture-isnt-canceled
  (testing "demonstate the problem"
    (let [signal (atom nil)
          go-ahead (promise)
          v (vfuture
              @(vfuture
                 @go-ahead
                 (reset! signal :works!)))]
      (Thread/sleep 50)
      (future-cancel v)
      (deliver go-ahead true)
      (Thread/sleep 50)
      (is (= @signal nil))
      (is (thrown? java.util.concurrent.CancellationException @v))))

  (let [signal (atom nil)
        go-ahead (promise)
        v (vfuture
            @(severed-vfuture
               @go-ahead
               (reset! signal :works!)))]
    (Thread/sleep 50)
    (future-cancel v)
    (deliver go-ahead true)
    (Thread/sleep 50)
    (is (= @signal :works!))
    (is (thrown? java.util.concurrent.CancellationException @v))))
