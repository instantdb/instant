(ns instant.util.async-test
  (:require
   [clojure.core.async :as a]
   [clojure.test :refer [deftest is testing]]
   [instant.util.async :refer [chunked-chan make-limited-concurrency-executor
                               severed-vfuture submitBlocking tracked-future
                               vfut-bg vfuture]])
  (:import
   (java.util.concurrent ExecutionException Future)))

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
          put3 (future (let [res (a/>!! in [5 6])]
                         (deliver put3-started true)
                         res))
          put4-started (promise)
          put4 (future @put3-started
                       (let [res (a/>!! in [7 8])]
                         (deliver put4-started true)
                         res))
          _put5 (future @put4-started
                        (a/>!! in [9 10]))]

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
          put3 (future (let [res (a/>!! in 3)]
                         (deliver put3-started true)
                         res))
          put4-started (promise)
          _put4 (future @put3-started
                        (let [res (a/>!! in 4)]
                          (deliver put4-started true)
                          res))
          _put5 (future @put4-started
                        (a/>!! in 5))]

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

(deftest submit-blocking-returns-the-task-result
  (let [executor (make-limited-concurrency-executor 2)]
    (is (= 3 (.get ^Future (submitBlocking executor (fn [] (+ 1 2))))))))

(deftest submit-blocking-blocks-the-caller-when-at-capacity
  (let [executor (make-limited-concurrency-executor 1)
        a-started (promise)
        release-a (promise)
        ;; A takes the only permit and parks, holding it
        a-fut (submitBlocking executor (fn []
                                         (deliver a-started true)
                                         @release-a
                                         :a))]
    (is (= true (deref a-started 1000 :timeout)))
    (let [b-submitted (promise)
          ;; B's submit must block on the calling thread until A frees the permit
          b-fut (future
                  (let [f (submitBlocking executor (fn [] :b))]
                    (deliver b-submitted true)
                    f))]
      ;; the submit call itself hasn't returned yet — no permit available
      (is (= :timeout (deref b-submitted 200 :timeout)))
      ;; let A finish; its permit is released and B's submit proceeds
      (deliver release-a true)
      (is (= true (deref b-submitted 1000 :timeout)))
      (is (= :a (.get ^Future a-fut)))
      (is (= :b (.get ^Future (deref b-fut 1000 :timeout)))))))

(deftest submit-blocking-never-exceeds-the-concurrency-limit
  (let [max-concurrency 3
        executor (make-limited-concurrency-executor max-concurrency)
        running (atom 0)
        peak (atom 0)
        futs (doall
              (for [_ (range 20)]
                (submitBlocking executor
                                (fn []
                                  (swap! peak max (swap! running inc))
                                  (Thread/sleep 20)
                                  (swap! running dec)))))]
    (doseq [^Future f futs]
      (.get f))
    (is (<= @peak max-concurrency))
    (is (= 0 @running))))

(deftest submit-blocking-releases-the-permit-when-a-task-throws
  (let [executor (make-limited-concurrency-executor 1)
        boom (submitBlocking executor (fn [] (throw (ex-info "boom" {}))))]
    (is (thrown? ExecutionException (.get ^Future boom)))
    ;; the failed task must have released its permit, so the next submit isn't
    ;; blocked forever
    (let [ok (future (.get ^Future (submitBlocking executor (fn [] :ok))))]
      (is (= :ok (deref ok 1000 :timeout))))))
