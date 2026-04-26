(ns instant.reactive.invalidator-singleton-test
  (:require
   [clojure.core.async :as a]
   [clojure.test :as test :refer [deftest is testing]]
   [instant.grouped-queue :as grouped-queue]
   [instant.grpc :as grpc]
   [instant.isn :as isn]
   [instant.model.history :as history-model]
   [instant.reactive.invalidator :as inv]
   [instant.util.test :refer [wait-for]])
  (:import
   (io.grpc.stub ServerCallStreamObserver StreamObserver)))

;; ------
;; helpers

(defn make-wal-record
  [{:keys [app-id tx-id isn previous-isn nextlsn]
    :or {app-id (random-uuid)
         tx-id 0
         nextlsn nil}}]
  (grpc/->WalRecord app-id
                    tx-id
                    isn
                    previous-isn
                    nil
                    0
                    nextlsn
                    []
                    []
                    []
                    []
                    []))

(defn capture-queue
  "Start a grouped-queue whose process-fn just collects records into an atom.
   Strips the :instant.grouped-queue/put-at timestamp that put! adds so
   tests can compare against the originals."
  []
  (let [records (atom [])
        queue (grouped-queue/start
               {:group-key-fn :app-id
                :process-fn (fn [_k r]
                              (swap! records conj
                                     (dissoc r :instant.grouped-queue/put-at)))
                :max-workers 1})]
    {:queue queue
     :records records
     :stop (fn [] (grouped-queue/stop queue {}))}))

(defn fake-observer
  "StreamObserver that collects onNext payloads; optionally throws from onNext."
  [{:keys [on-next throw?]}]
  (let [received (atom [])
        completed? (atom false)]
    {:observer (reify StreamObserver
                 (onNext [_ v]
                   (swap! received conj v)
                   (when on-next (on-next v))
                   (when throw?
                     (throw (ex-info "observer boom" {}))))
                 (onError [_ _])
                 (onCompleted [_]
                   (reset! completed? true)))
     :received received
     :completed? completed?}))

(defn fake-server-observer
  "Minimal ServerCallStreamObserver that captures the close/cancel handlers
   the singleton invalidator installs on it."
  []
  (let [state (atom {:completed? false
                     :received []
                     :on-close nil
                     :on-cancel nil})
        observer (proxy [ServerCallStreamObserver] []
                   (onNext [v]
                     (swap! state update :received conj v))
                   (onError [_t]
                     (swap! state assoc :errored? true))
                   (onCompleted []
                     (swap! state assoc :completed? true))
                   (setOnCloseHandler [^Runnable r]
                     (swap! state assoc :on-close r))
                   (setOnCancelHandler [^Runnable r]
                     (swap! state assoc :on-cancel r))
                   (isReady []
                     true))]
    {:observer observer
     :state state}))

(defmacro with-fresh-registry
  "Runs body with a freshly-initialised inv/grpc-registry, restored afterward."
  [& body]
  `(with-redefs [inv/grpc-registry (atom {:local-processes {}
                                          :remote-observers {}})]
     ~@body))

;; ------
;; handle-singleton-wal-record

(deftest handle-singleton-wal-record-sets-previous-isn-on-first-record
  (let [{:keys [queue records stop]} (capture-queue)
        previous-isn-atom (atom nil)
        rec (make-wal-record {:isn (isn/test-isn 10)
                              :previous-isn (isn/test-isn 9)
                              :tx-id 1})]
    (try
      (inv/handle-singleton-wal-record {:queue queue
                                        :previous-isn-atom previous-isn-atom}
                                       rec)
      (wait-for #(seq @records) 1000)
      (is (= (isn/test-isn 10) @previous-isn-atom))
      (is (= [rec] @records))
      (finally (stop)))))

(deftest handle-singleton-wal-record-advances-on-newer-isn
  (let [{:keys [queue records stop]} (capture-queue)
        previous-isn-atom (atom (isn/test-isn 10))
        rec (make-wal-record {:isn (isn/test-isn 20)
                              :previous-isn (isn/test-isn 10)
                              :tx-id 2})]
    (try
      (inv/handle-singleton-wal-record {:queue queue
                                        :previous-isn-atom previous-isn-atom}
                                       rec)
      (wait-for #(seq @records) 1000)
      (is (= (isn/test-isn 20) @previous-isn-atom))
      (is (= [rec] @records))
      (finally (stop)))))

(deftest handle-singleton-wal-record-does-not-go-backwards
  (testing "an older isn leaves the previous-isn-atom unchanged but still enqueues"
    (let [{:keys [queue records stop]} (capture-queue)
          previous-isn-atom (atom (isn/test-isn 20))
          rec (make-wal-record {:isn (isn/test-isn 10)
                                :previous-isn (isn/test-isn 9)
                                :tx-id 1})]
      (try
        (inv/handle-singleton-wal-record {:queue queue
                                          :previous-isn-atom previous-isn-atom}
                                         rec)
        (wait-for #(seq @records) 1000)
        (is (= (isn/test-isn 20) @previous-isn-atom))
        (is (= [rec] @records))
        (finally (stop))))))

;; ------
;; broadcast-wal-record / broadcast-slot-disconnect

(deftest broadcast-wal-record-sends-to-every-observer
  (let [o1 (fake-observer {})
        o2 (fake-observer {})
        packed (byte-array [1 2 3])]
    (inv/broadcast-wal-record (fn [] [(:observer o1) (:observer o2)])
                              packed)
    (is (= 1 (count @(:received o1))))
    (is (= 1 (count @(:received o2))))
    (let [msg (first @(:received o1))]
      (is (instance? instant.grpc.PackedWalRecord msg))
      (is (= (seq packed) (seq (:ba msg)))))))

(deftest broadcast-wal-record-isolates-a-failing-observer
  (let [good (fake-observer {})
        bad (fake-observer {:throw? true})]
    (inv/broadcast-wal-record (fn [] [(:observer bad) (:observer good)])
                              (byte-array [1]))
    (is (= 1 (count @(:received good)))
        "good observer still receives the record even though bad one threw")))

(deftest broadcast-slot-disconnect-sends-to-every-observer-and-isolates-failures
  (let [good (fake-observer {})
        bad (fake-observer {:throw? true})]
    (inv/broadcast-slot-disconnect {:get-remote-observers
                                    (fn [] [(:observer bad) (:observer good)])})
    (is (= 1 (count @(:received good))))
    (is (instance? instant.grpc.SlotDisconnect (first @(:received good))))))

;; ------
;; handle-grpc-subscribe

(deftest handle-grpc-subscribe-with-no-local-processes-rejects
  (with-fresh-registry
    (let [{:keys [observer state]} (fake-server-observer)
          req (grpc/->InvalidatorSubscribe (random-uuid) (int 1))]
      (inv/handle-grpc-subscribe req observer)
      (is (:completed? @state)
          "observer completes immediately when no local processes are registered")
      (is (empty? (:remote-observers @inv/grpc-registry))))))

(deftest handle-grpc-subscribe-registers-and-triggers-subscribe
  (with-fresh-registry
    (let [{:keys [observer state]} (fake-server-observer)
          machine-id (random-uuid)
          req (grpc/->InvalidatorSubscribe machine-id (int 1))
          subscribed (atom [])]
      (swap! inv/grpc-registry assoc-in
             [:local-processes 99]
             {:subscribe (fn [mid] (swap! subscribed conj mid))})
      (inv/handle-grpc-subscribe req observer)
      (is (not (:completed? @state)))
      (is (instance? Runnable (:on-close @state)) "close handler installed")
      (is (instance? Runnable (:on-cancel @state)) "cancel handler installed")
      (is (= [machine-id] @subscribed))
      (is (= observer
             (get-in @inv/grpc-registry [:remote-observers req]))))))

(deftest handle-grpc-subscribe-cancel-handler-removes-observer
  (with-fresh-registry
    (let [{:keys [observer state]} (fake-server-observer)
          req (grpc/->InvalidatorSubscribe (random-uuid) (int 1))]
      (swap! inv/grpc-registry assoc-in
             [:local-processes 1] {:subscribe (fn [_])})
      (inv/handle-grpc-subscribe req observer)
      (is (some? (get-in @inv/grpc-registry [:remote-observers req])))
      (.run ^Runnable (:on-cancel @state))
      (is (nil? (get-in @inv/grpc-registry [:remote-observers req]))))))

;; ------
;; cleanup-local-process

(deftest cleanup-local-process-closes-observers-when-last-process-leaves
  (with-fresh-registry
    (let [{obs-1 :observer state-1 :state} (fake-server-observer)
          {obs-2 :observer state-2 :state} (fake-server-observer)
          req-1 (grpc/->InvalidatorSubscribe (random-uuid) (int 1))
          req-2 (grpc/->InvalidatorSubscribe (random-uuid) (int 2))]
      (reset! inv/grpc-registry
              {:local-processes {42 {:subscribe (fn [_])}}
               :remote-observers {req-1 obs-1
                                  req-2 obs-2}})
      (inv/cleanup-local-process 42)
      (is (empty? (:local-processes @inv/grpc-registry)))
      (is (empty? (:remote-observers @inv/grpc-registry)))
      (is (:completed? @state-1))
      (is (:completed? @state-2)))))

(deftest cleanup-local-process-keeps-observers-when-other-processes-remain
  (with-fresh-registry
    (let [{obs-1 :observer state-1 :state} (fake-server-observer)
          req-1 (grpc/->InvalidatorSubscribe (random-uuid) (int 1))]
      (reset! inv/grpc-registry
              {:local-processes {1 {:subscribe (fn [_])}
                                 2 {:subscribe (fn [_])}}
               :remote-observers {req-1 obs-1}})
      (inv/cleanup-local-process 1)
      (is (= #{2} (set (keys (:local-processes @inv/grpc-registry)))))
      (is (some? (get-in @inv/grpc-registry [:remote-observers req-1])))
      (is (not (:completed? @state-1))))))

;; ------
;; make-subscription-observer

(defn build-subscription-observer [{:keys [queue on-cancel]}]
  (let [prev (atom nil)
        chan (a/chan 4)]
    {:observer (inv/make-subscription-observer
                {:queue queue
                 :previous-isn-atom prev
                 :acquire-slot-interrupt-chan chan}
                (random-uuid)
                (or on-cancel (fn [])))
     :previous-isn-atom prev
     :acquire-slot-interrupt-chan chan}))

(deftest make-subscription-observer-routes-wal-records-to-queue
  (let [{:keys [queue records stop]} (capture-queue)
        {:keys [observer previous-isn-atom]} (build-subscription-observer {:queue queue})
        rec (make-wal-record {:isn (isn/test-isn 10) :tx-id 1})]
    (try
      (.onNext ^StreamObserver observer rec)
      (wait-for #(seq @records) 1000)
      (is (= [rec] @records))
      (is (= (isn/test-isn 10) @previous-isn-atom))
      (finally (stop)))))

(deftest make-subscription-observer-unpacks-packed-wal-records
  (let [{:keys [queue records stop]} (capture-queue)
        {:keys [observer]} (build-subscription-observer {:queue queue})
        rec (make-wal-record {:isn (isn/test-isn 7) :tx-id 3})
        packed (history-model/pack-wal-record rec)]
    (try
      (.onNext ^StreamObserver observer (grpc/->PackedWalRecord packed))
      (wait-for #(seq @records) 1000)
      (is (= 1 (count @records)))
      (is (= (:tx-id rec) (:tx-id (first @records))))
      (finally (stop)))))

(deftest make-subscription-observer-forwards-slot-disconnect
  (let [{:keys [queue stop]} (capture-queue)
        {:keys [observer acquire-slot-interrupt-chan]}
        (build-subscription-observer {:queue queue})]
    (try
      (.onNext ^StreamObserver observer (grpc/->SlotDisconnect))
      (is (true? (first (a/alts!! [acquire-slot-interrupt-chan
                                   (a/timeout 1000)]))))
      (finally (stop)))))

(deftest make-subscription-observer-runs-on-cancel-on-completed
  (let [{:keys [queue stop]} (capture-queue)
        cancelled? (atom false)
        {:keys [observer]} (build-subscription-observer
                            {:queue queue
                             :on-cancel #(reset! cancelled? true)})]
    (try
      (.onCompleted ^StreamObserver observer)
      (is @cancelled?)
      (finally (stop)))))

(deftest make-subscription-observer-runs-on-cancel-on-error
  (let [{:keys [queue stop]} (capture-queue)
        cancelled? (atom false)
        {:keys [observer]} (build-subscription-observer
                            {:queue queue
                             :on-cancel #(reset! cancelled? true)})]
    (try
      (.onError ^StreamObserver observer (ex-info "boom" {}))
      (is @cancelled?)
      (finally (stop)))))

(comment
  (test/run-tests *ns*))
