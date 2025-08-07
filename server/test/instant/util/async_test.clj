(ns instant.util.async-test
  (:require
   [clojure.core.async :as a]
   [clojure.test :refer [deftest is testing]]
   [instant.util.async :refer [chunked-chan severed-vfuture tracked-future vfut-bg vfuture]]))

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

(deftest chuncked-chan
  (testing "chunked-chan delivers results after max-items"
    (let [{:keys [in out shutdown]} (chunked-chan {:flush-ms 100000
                                                   :max-size 4})]
      (a/put! in [1 2])
      (a/put! in [3 4])
      (a/put! in [5 6])

      (is (= [1 2 3 4] (deref (future (a/<!! out))
                              100
                              :timeout)))

      (is (not= :timeout (deref (future (a/<!! (shutdown))) 10 :timeout)))))
  (testing "chunked-chan delivers results after timeout"
    (let [{:keys [in out shutdown]} (chunked-chan {:flush-ms 100
                                                   :max-size 1000})]
      (a/put! in [1 2])
      (a/put! in [3 4])
      (a/put! in [5 6])

      (is (= [1 2 3 4 5 6]
             (deref (future (a/<!! out))
                    200
                    :timeout)))

      (is (not= :timeout (deref (future (a/<!! (shutdown))) 10 :timeout)))))

  (testing "chunked-chan blocks if the buffer is full and nobody took"
    (let [{:keys [in shutdown]} (chunked-chan {:flush-ms 100
                                               :max-size 4})]
      (is (= true (deref (future (a/>!! in [1 2]))
                         100
                         :timeout)))
      (is (= true (deref (future (a/>!! in [3 4]))
                         100
                         :timeout)))
      (is (= :timeout (deref (future (a/>!! in [5 6]))
                             100
                             :timeout)))
      (is (not= :timeout (deref (future (a/<!! (shutdown))) 10 :timeout)))))

  (testing "smoke test"
    (let [{:keys [in out shutdown]} (chunked-chan {:flush-ms 100
                                                   :max-size 4})
          put1 (future (a/>!! in [1 2]))
          _ (is (= true (deref put1 10 :timeout)))
          put2 (future (a/>!! in [3 4]))
          _ (is (= true (deref put2 10 :timeout)))
          put3-started (promise)
          put3 (future (deliver put3-started true)
                       (a/>!! in [5 6]))
          put4-started (promise)
          put4 (and @put3-started (future (deliver put4-started true)
                                          (a/>!! in [7 8])))
          _put5 (and @put4-started (future (a/>!! in [9 10])))]

      (is (= [1 2 3 4] (deref (future (a/<!! out))
                              10
                              :timeout)))

      (is (= true (deref put3 10 :timeout)))
      (is (= true (deref put4 10 :timeout)))

      (is (= [5 6 7 8] (deref (future (a/<!! out))
                              10
                              :timeout)))

      (is (= [9 10] (deref (future (a/<!! out))
                           1000
                           :timeout)))

      (is (not= :timeout (deref (future (a/<!! (shutdown))) 10 :timeout)))))

  (testing "custom accumulator"
    (let [{:keys [in out shutdown]} (chunked-chan {:flush-ms 100
                                          :max-size 3
                                          :combine (fn [acc x]
                                                     (+ acc x))
                                          :size identity
                                          :init 0})
          put1 (future (a/>!! in 1))
          _ (is (= true (deref put1 10 :timeout)))
          put2 (future (a/>!! in 2))
          _ (is (= true (deref put2 10 :timeout)))
          put3-started (promise)
          put3 (future (deliver put3-started true)
                       (a/>!! in 3))
          put4-started (promise)
          _put4 (and @put3-started
                    (future (deliver put4-started true)
                            (a/>!! in 4)))
          _put5 (and @put4-started
                     (future (a/>!! in 5)))]

      (is (= 3 (deref (future (a/<!! out))
                      10
                      :timeout)))

      (is (= true (deref put3 10 :timeout)))

      (is (= 3 (deref (future (a/<!! out))
                      10
                      :timeout)))

      (is (= 4 (deref (future (a/<!! out))
                      1000
                      :timeout)))

      (is (= 5 (deref (future (a/<!! out))
                      1000
                      :timeout)))

      (is (not= :timeout (deref (future (a/<!! (shutdown))) 10 :timeout))))))
