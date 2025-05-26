(ns instant.util.hazelcast-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [instant.reactive.ephemeral :as eph]
   [instant.reactive.store :as rs]
   [instant.util.hazelcast :as h])
  (:import
   (com.hazelcast.core HazelcastInstance)
   (com.hazelcast.map IMap)))

(deftest room-key-roundtrips
  (let [start (h/->RoomKeyV1 (random-uuid) "room-id")
        serializer h/room-key-serializer]
    (is (= start (->> (.write serializer start)
                      (.read serializer))))))

(deftest remove-session-roundtrips
  (let [start (h/->RemoveSessionMergeV1 (random-uuid))
        serializer h/remove-session-serializer]
    (is (= start (->> (.write serializer start)
                      (.read serializer))))))

(deftest join-room-roundtrips
  (testing "with user"
    (let [start (h/->JoinRoomMergeV2 (random-uuid) (random-uuid) {"hello" "world"})
          serializer h/join-room-serializer]
      (is (= start (->> (.write serializer start)
                        (.read serializer))))))
  (testing "without user"
    (let [start (h/->JoinRoomMergeV2 (random-uuid) nil nil)
          serializer h/join-room-serializer]
      (is (= start (->> (.write serializer start)
                        (.read serializer))))))

  (testing "without data"
    (let [start (h/->JoinRoomMergeV2 (random-uuid) (random-uuid) nil)
          serializer h/join-room-serializer]
      (is (= start (->> (.write serializer start)
                        (.read serializer)))))))

(deftest set-presence-roundtrips
  (let [start (h/->SetPresenceMergeV1 (random-uuid) {:some :data})
        serializer h/set-presence-serializer]
    (is (= start (->> (.write serializer start)
                      (.read serializer))))))

(deftest patch-test
  (let [^HazelcastInstance hz
        (:hz
         (eph/init-hz :test
                      (rs/init)
                      (let [id (+ 100000 (rand-int 900000))]
                        {:instance-name (str "test-instance-" id)
                         :cluster-name  (str "test-cluster-" id)})))]
    (try
      (let [m ^IMap (.getMap hz "a-map")]
        (is (= {} (.getAll m (.keySet m))))

        (h/patch-assoc-in m ["i-1"] {:heartbeat 1})
        (is (= {"i-1" {:heartbeat 1}} (.getAll m (.keySet m))))

        (h/patch-assoc-in m ["i-1" :heartbeat] 2)
        (is (= {"i-1" {:heartbeat 2}} (.getAll m (.keySet m))))

        (h/patch-assoc-in m ["i-2" :heartbeat] 3)
        (is (= {"i-1" {:heartbeat 2}
                "i-2" {:heartbeat 3}} (.getAll m (.keySet m))))

        (h/patch-assoc-in m ["i-1" :status] :ok)
        (is (= {"i-1" {:heartbeat 2, :status :ok}
                "i-2" {:heartbeat 3}} (.getAll m (.keySet m))))

        (h/patch-assoc-in m ["i-1" :a :b :c] :ok)
        (is (= {"i-1" {:heartbeat 2, :status :ok, :a {:b {:c :ok}}}
                "i-2" {:heartbeat 3}} (.getAll m (.keySet m))))

        (h/patch-merge-in m ["i-1" :a :b] {:c :ok-2, :d :new})
        (is (= {"i-1" {:heartbeat 2, :status :ok, :a {:b {:c :ok-2, :d :new}}}
                "i-2" {:heartbeat 3}} (.getAll m (.keySet m))))

        (h/patch-merge-in m ["i-1"] {:x 1, :status :ok-3})
        (is (= {"i-1" {:heartbeat 2, :status :ok-3, :a {:b {:c :ok-2, :d :new}}, :x 1}
                "i-2" {:heartbeat 3}} (.getAll m (.keySet m))))

        (h/patch-dissoc-in m ["i-1" :status])
        (is (= {"i-1" {:heartbeat 2, :a {:b {:c :ok-2, :d :new}}, :x 1}
                "i-2" {:heartbeat 3}} (.getAll m (.keySet m))))

        (h/patch-dissoc-in m ["i-1"])
        (is (= {"i-2" {:heartbeat 3}} (.getAll m (.keySet m))))

        (h/patch-dissoc-in m ["i-2"])
        (is (= {} (.getAll m (.keySet m)))))
      (finally
        (.shutdown hz)))))
