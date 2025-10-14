(ns instant.util.hazelcast-test
  (:require [instant.util.crypt :as crypt-util]
            [instant.util.hazelcast :as h]
            [clojure.test :refer [deftest is testing]]))

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
    (let [start (h/->JoinRoomMergeV3 (random-uuid) "dev" (random-uuid) {"hello" "world"})
          serializer h/join-room-v3-serializer]
      (is (= start (->> (.write serializer start)
                        (.read serializer))))))
  (testing "without user"
    (let [start (h/->JoinRoomMergeV3 (random-uuid) "dev" nil nil)
          serializer h/join-room-v3-serializer]
      (is (= start (->> (.write serializer start)
                        (.read serializer))))))

  (testing "without data"
    (let [start (h/->JoinRoomMergeV3 (random-uuid) "dev" (random-uuid) nil)
          serializer h/join-room-v3-serializer]
      (is (= start (->> (.write serializer start)
                        (.read serializer)))))))

(deftest set-presence-roundtrips
  (let [start (h/->SetPresenceMergeV1 (random-uuid) {:some :data})
        serializer h/set-presence-serializer]
    (is (= start (->> (.write serializer start)
                      (.read serializer))))))

(deftest sse-message-roundtrips
  (let [start (h/map->SSEMessage {:app-id (random-uuid)
                                  :session-id (random-uuid)
                                  :sse-token-hash (crypt-util/uuid->sha256 (random-uuid))
                                  :messages [{:op :hello-world
                                              :q {:bookshelves {:$ {:where {:user.handle "alex"}}}}}]})
        serializer h/sse-message-serializer]
    (is (= (update start :sse-token-hash crypt-util/bytes->hex-string)
           (update (->> (.write serializer start)
                        (.read serializer))
                   :sse-token-hash crypt-util/bytes->hex-string)))))
