(ns instant.reactive.session-test
  (:require
   [clojure.test :as test :refer [deftest testing is]]
   [datascript.core :as ds]
   [instant.data.constants :refer [movies-app-id zeneca-app-id]]
   [instant.reactive.session :as session]
   [instant.reactive.store :as rs]
   [instant.fixtures :refer [with-empty-app with-movies-app]]
   [clojure.core.async :as a]
   [instant.util.async :as ua]
   [instant.data.resolvers :as resolvers]
   [instant.db.datalog :as d]
   [instant.jdbc.aurora :as aurora]
   [instant.db.transaction :as tx]
   [instant.db.instaql :as iq]
   [instant.lib.ring.websocket :as ws]
   [instant.reactive.ephemeral :as eph]
   [instant.reactive.query :as rq])
  (:import
   (java.util UUID)
   (java.util.concurrent LinkedBlockingQueue)))

(def ^:private r (delay (resolvers/make-movies-resolver)))

(def ^:private non-existent-app-id
  #uuid "39b33777-3324-42dd-8f47-ce41d246c5a6")

(def ^:dynamic *store-conn* nil)
(def ^:dynamic *eph-store-atom* nil)
(def ^:dynamic *instaql-query-results* nil)

(defn- with-session [f]
  (let [sess-id (UUID/randomUUID)
        fake-ws-conn (a/chan 1)
        receive-q (LinkedBlockingQueue.)
        room-refresh-ch (a/chan (a/sliding-buffer 1))
        store-conn (rs/init-store)
        eph-store-atom (atom {})
        socket {:id sess-id
                :ws-conn fake-ws-conn
                :receive-q receive-q
                :ping-job (future)
                :pending-handlers (atom #{})}
        second-socket {:id (random-uuid)
                       :ws-conn (a/chan 1)
                       :receive-q receive-q
                       :ping-job (future)
                       :pending-handlers (atom #{})}
        query-reactive rq/instaql-query-reactive!]
    (session/on-open store-conn socket)
    (session/on-open store-conn second-socket)

    (binding [*store-conn* store-conn
              *instaql-query-results* (atom {})
              *eph-store-atom* eph-store-atom]
      (with-redefs [session/receive-q receive-q
                    eph/room-refresh-ch room-refresh-ch
                    ws/send-json! (fn [msg fake-ws-conn]
                                    (a/>!! fake-ws-conn msg))

                    rq/instaql-query-reactive!
                    (fn [store-conn {:keys [session-id] :as base-ctx} instaql-query]
                      (let [res (query-reactive store-conn base-ctx instaql-query)]
                        (swap! *instaql-query-results* assoc-in [session-id instaql-query] res)
                        res))]
        (f store-conn eph-store-atom {:socket socket
                                      :second-socket second-socket})
        (session/on-close store-conn eph-store-atom socket)
        (session/on-close store-conn eph-store-atom second-socket)))))

(defn- blocking-send-msg [{:keys [ws-conn id]} msg]
  (session/handle-receive *store-conn* *eph-store-atom* (rs/get-session @*store-conn* id) msg)
  (let [ret (ua/<!!-timeout ws-conn)]
    (assert (not= :timeout ret) "Timed out waiting for a response")
    (dissoc ret :client-event-id)))

(defn- blocking-send-refresh [{:keys [id] :as socket} msg]
  (blocking-send-msg socket (assoc msg :session-id id)))

(defn- pretty-auth [{:keys [app user] :as _auth}]
  [(:title app) (:email user)])

(deftest anon-auth
  (with-session
    (fn [store-conn _eph-store-atom {:keys [socket]
                                     {:keys [id]} :socket}]
      (testing "non-existent app"
        (is (= 400
               (:status (blocking-send-msg
                         socket
                         {:op :init :app-id non-existent-app-id})))))
      (testing "existing app"
        (let [{op :op event-auth :auth} (blocking-send-msg socket {:op :init :app-id zeneca-app-id})
              store-auth (rs/get-auth @store-conn id)]
          (is (= :init-ok op))
          (is (= ["Zeneca-ex" nil] (pretty-auth event-auth)))
          (is (= ["Zeneca-ex" nil] (pretty-auth store-auth)))))

      (testing "already authed"
        (is (= 400
               (:status (blocking-send-msg socket {:op :init :app-id movies-app-id}))))))))

(def ^:private query-1987
  {:kw-q  {:movie {:$ {:where {:year 1987}}}}
   :client-resp '({:data
                   {:datalog-result
                    {:join-rows
                     #{#{("eid-lethal-weapon" :movie/title "Lethal Weapon")
                         ("eid-robocop" :movie/year 1987)
                         ("eid-robocop" :movie/title "RoboCop")
                         ("eid-predator" :movie/year 1987)
                         ("eid-predator" :movie/title "Predator")
                         ("eid-lethal-weapon" :movie/year 1987)}}}},
                   :child-nodes ()})
   :store-resp '[{:data {:k "movie"
                         :datalog-query [[:ea ?movie-0 :movie/year 1987]],
                         :datalog-result
                         {:topics [[:ea _ #{:movie/year} #{1987}]],
                          :symbol-values {?movie-0 #{"eid-lethal-weapon" "eid-robocop" "eid-predator"}},
                          :join-rows
                          #{[["eid-lethal-weapon" :movie/year 1987]]
                            [["eid-predator" :movie/year 1987]]
                            [["eid-robocop" :movie/year 1987]]}}},
                  :child-nodes
                  [{:data {:datalog-query [[:ea "eid-robocop"]],
                           :datalog-result
                           {:topics [[:ea #{"eid-robocop"} _ _]],
                            :symbol-values {}
                            :join-rows
                            #{[["eid-robocop" :movie/title "RoboCop"]]
                              [["eid-robocop" :movie/year 1987]]}}},
                    :child-nodes []}
                   {:data {:datalog-query [[:ea "eid-predator"]],
                           :datalog-result
                           {:topics [[:ea #{"eid-predator"} _ _]],
                            :symbol-values {},
                            :join-rows
                            #{[["eid-predator" :movie/year 1987]]
                              [["eid-predator" :movie/title "Predator"]]}}},
                    :child-nodes []}
                   {:data {:datalog-query [[:ea "eid-lethal-weapon"]],
                           :datalog-result
                           {:topics [[:ea #{"eid-lethal-weapon"} _ _]],
                            :symbol-values {},
                            :join-rows
                            #{[["eid-lethal-weapon" :movie/year 1987]]
                              [["eid-lethal-weapon" :movie/title "Lethal Weapon"]]}}},
                    :child-nodes []}]}]})

(def ^:private query-robocop
  {:kw-q {:movie {:$ {:where {:title "RoboCop"}}}}
   :client-resp '({:data
                   {:datalog-result
                    {:join-rows
                     #{#{("eid-robocop" :movie/year 1987)
                         ("eid-robocop" :movie/title "RoboCop")}}}},
                   :child-nodes ()})
   :store-resp '[{:data {:k "movie",
                         :datalog-query [[:ea ?movie-0 :movie/title "RoboCop"]],
                         :datalog-result
                         {:topics [[:ea _ #{:movie/title} #{"RoboCop"}]],
                          :symbol-values {?movie-0 #{"eid-robocop"}},
                          :join-rows #{[["eid-robocop" :movie/title "RoboCop"]]}}},
                  :child-nodes
                  [{:data {:datalog-query [[:ea "eid-robocop"]],
                           :datalog-result
                           {:topics [[:ea #{"eid-robocop"} _ _]],
                            :symbol-values {},
                            :join-rows
                            #{[["eid-robocop" :movie/title "RoboCop"]]
                              [["eid-robocop" :movie/year 1987]]}}},
                    :child-nodes []}]}]})

(defn- pretty-subs [subscriptions]
  (->> subscriptions
       (map (juxt :instaql-query :datalog-query))
       (group-by first)
       (map (fn [[k v]] [k (set (map second v))]))
       (into {})))

(defn- drop-join-rows-created-at [datalog-result]
  (update datalog-result :join-rows
          #(set (map (fn [row]
                       (set (map (fn [subrow]
                                   (butlast subrow))
                                 row)))
                     %))))

(defn- remove-created-at [node]
  (-> node
      (update-in [:data :datalog-result] drop-join-rows-created-at)
      (update :child-nodes (partial map remove-created-at))))

(defn- pretty-query [_db session-id q]
  (let [res (->> *instaql-query-results*
                 deref
                 (#(get-in % [session-id q]))
                 :instaql-result
                 (resolvers/walk-friendly @r))]
    (map remove-created-at res)))

(deftest add-query-requires-auth
  (with-session
    (fn [_store-conn _eph-store-atom {:keys [socket]}]
      (is (= 400
             (:status (blocking-send-msg
                       socket {:op :add-query :q (:kw-q query-1987)})))))))

(deftest add-malformed-query-rejected
  (with-session
    (fn [_store-conn _ {:keys [socket]}]
      (blocking-send-msg socket {:op :init :app-id movies-app-id})
      (testing "malformed query are rejected"
        (is (= 400
               (:status (blocking-send-msg socket {:op :add-query :q {:movie "Foo"}}))))))))

(deftest add-query-works
  (with-session
    (fn [_store-conn _eph-store-atom {:keys [socket]}]
      (blocking-send-msg socket {:op :init :app-id movies-app-id})

      (testing "add query: movies in 1987"
        (let [{:keys [op q result]} (blocking-send-msg socket
                                                       {:op :add-query
                                                        :q (:kw-q query-1987)})]
          (is (= op :add-query-ok))
          (is (= (:kw-q query-1987) q))
          (is (= (:client-resp query-1987)
                 (resolvers/walk-friendly @r (map remove-created-at result)))))))))

(deftest add-query-sets-store
  (with-session
    (fn [store-conn _eph-store-atom {:keys [socket]
                                     {:keys [id]} :socket}]
      (blocking-send-msg socket {:op :init :app-id movies-app-id})
      (blocking-send-msg socket
                         {:op :add-query
                          :q (:kw-q query-1987)})
      (blocking-send-msg socket
                         {:op :add-query
                          :q (:kw-q query-robocop)})

      (testing "datalog-cache is set"
        (is (= '#{{:children
                   {:pattern-groups
                    [{:patterns [[:ea ?movie-0 :movie/year 1987]],
                      :children
                      {:pattern-groups [{:patterns [[:ea ?movie-0]]}],
                       :join-sym ?movie-0}}]}}
                  {:children
                   {:pattern-groups
                    [{:patterns [[:ea ?movie-0 :movie/title "RoboCop"]],
                      :children
                      {:pattern-groups [{:patterns [[:ea ?movie-0]]}],
                       :join-sym ?movie-0}}]}}}
               (->> (#'rs/get-datalog-cache-for-app @store-conn movies-app-id)
                    (resolvers/walk-friendly @r)
                    keys
                    set))))

      (testing "subs are set"
        (is (= '{{:movie {:$ {:where {:year 1987}}}}
                 #{{:children
                    {:pattern-groups
                     [{:patterns [[:ea ?movie-0 :movie/year 1987]],
                       :children
                       {:pattern-groups [{:patterns [[:ea ?movie-0]]}],
                        :join-sym ?movie-0}}]}}},
                 {:movie {:$ {:where {:title "RoboCop"}}}}
                 #{{:children
                    {:pattern-groups
                     [{:patterns [[:ea ?movie-0 :movie/title "RoboCop"]],
                       :children
                       {:pattern-groups [{:patterns [[:ea ?movie-0]]}],
                        :join-sym ?movie-0}}]}}}}
               (->> (#'rs/get-subscriptions-for-app-id @store-conn movies-app-id)
                    (resolvers/walk-friendly @r)
                    pretty-subs))))

      (testing "instaql-queries are set"
        (is (= (:client-resp query-1987)
               (pretty-query @store-conn id (:kw-q query-1987))))
        (is (= (:client-resp query-robocop)
               (pretty-query @store-conn id (:kw-q query-robocop))))))))

(deftest add-duplicate-query-returns-query-exists
  (with-session
    (fn [_store-conn _eph-store-atom {:keys [socket]}]
      (blocking-send-msg socket {:op :init :app-id movies-app-id})
      (blocking-send-msg socket {:op :add-query :q (:kw-q query-robocop)})
      (is (= {:op :add-query-exists,
              :q (:kw-q query-robocop)}
             (blocking-send-msg socket {:op :add-query
                                        :q (:kw-q query-robocop)}))))))

(deftest remove-query-works
  (with-session
    (fn [_store-conn _eph-store-atom {:keys [socket]}]
      (blocking-send-msg socket {:op :init :app-id movies-app-id})
      (blocking-send-msg socket
                         {:op :add-query
                          :q (:kw-q query-1987)})

      (is (= {:op :remove-query-ok,
              :q (:kw-q query-1987)}
             (blocking-send-msg socket {:op :remove-query
                                        :q (:kw-q query-1987)}))))))

(deftest remove-query-updates-store
  (with-session
    (fn [store-conn _eph-store-atom {:keys [socket]}]
      (blocking-send-msg socket {:op :init :app-id movies-app-id})

      (blocking-send-msg socket
                         {:op :add-query
                          :q (:kw-q query-1987)})

      (blocking-send-msg socket
                         {:op :add-query
                          :q (:kw-q query-robocop)})

      ;; okay, let's delete the first query
      (is (= {:op :remove-query-ok,
              :q (:kw-q query-1987)}
             (blocking-send-msg socket {:op :remove-query
                                        :q (:kw-q query-1987)})))

      (testing "stray datalog queries are removed"
        (is (= '#{{:children
                   {:pattern-groups
                    [{:patterns [[:ea ?movie-0 :movie/title "RoboCop"]],
                      :children
                      {:pattern-groups [{:patterns [[:ea ?movie-0]]}],
                       :join-sym ?movie-0}}]}}}
               (->> (#'rs/get-datalog-cache-for-app @store-conn movies-app-id)
                    (resolvers/walk-friendly @r)
                    keys
                    set))))

      (testing "subs for query one are removed"
        (is (= '{{:movie {:$ {:where {:title "RoboCop"}}}}
                 #{{:children
                    {:pattern-groups
                     [{:patterns [[:ea ?movie-0 :movie/title "RoboCop"]],
                       :children
                       {:pattern-groups [{:patterns [[:ea ?movie-0]]}],
                        :join-sym ?movie-0}}]}}}}
               (some->> (#'rs/get-subscriptions-for-app-id @store-conn movies-app-id)
                        seq
                        (resolvers/walk-friendly @r)
                        pretty-subs))))

      ;; okay, now for the second query
      (is (= {:op :remove-query-ok,
              :q (:kw-q query-robocop)}
             (blocking-send-msg socket {:op :remove-query
                                        :q (:kw-q query-robocop)})))

      (testing "all subs are gone"
        (is (empty? (#'rs/get-subscriptions-for-app-id @store-conn movies-app-id))))

      (testing "datalog-cache is cleaned"
        (is (empty? (#'rs/get-datalog-cache-for-app @store-conn movies-app-id)))))))

(deftest mark-stale-topics-works
  (with-movies-app
    (fn [{app-id :id :as _app} r]
      (with-session
        (fn [store-conn _eph-store-atom {{sess-id :id :as socket} :socket}]
          (blocking-send-msg socket {:op :init :app-id app-id})
          (blocking-send-msg socket
                             {:op :add-query
                              :q (:kw-q query-1987)})

          ;; No stale queries at first
          (is (empty? (rs/get-stale-instaql-queries @store-conn sess-id)))

          (rs/mark-stale-topics! store-conn
                                 app-id
                                 5
                                 [(d/pat->coarse-topic
                                   [:ea
                                    (resolvers/->uuid r "eid-predator")])])

            ;; Now we have a stale query
          (is (= [(:kw-q query-1987)]
                 (rs/get-stale-instaql-queries @store-conn sess-id)))

            ;; We also removed datalog queries from cache
          (is (= '#{}
                 (->> (#'rs/get-datalog-cache-for-app @store-conn app-id)
                      (resolvers/walk-friendly r)
                      keys
                      set)))

            ;; we also recorded the tx-id that was processed
          (is (= 5 (rs/get-processed-tx-id @store-conn app-id))))))))

(deftest refresh-populates-cache
  (with-movies-app
    (fn [{app-id :id :as _app} r]
      (with-session
        (fn [store-conn _eph-store-atom {{sess-id :id :as socket} :socket}]
          (blocking-send-msg socket {:op :init :app-id app-id})
          (blocking-send-msg socket
                             {:op :add-query
                              :q (:kw-q query-1987)})
          (rs/mark-stale-topics! store-conn
                                 app-id
                                 0
                                 [(d/pat->coarse-topic
                                   [:ea
                                    (resolvers/->uuid r "eid-predator")])])

          (testing "send refresh"
            ;; clear the query hash so that the refresh will trigger a send
            (ds/transact! store-conn [[:db/retract
                                       [:instaql-query/session-id+query [sess-id (:kw-q query-1987)]]
                                       :instaql-query/hash]])
            (blocking-send-refresh socket {:op :refresh})

            ;; After refresh there should be no more stale queries
            (is (empty? (rs/get-stale-instaql-queries @store-conn sess-id)))

            ;; Datalog cache now has more things
            (is (= '#{{:children
                       {:pattern-groups
                        [{:patterns [[:ea ?movie-0 :movie/year 1987]],
                          :children
                          {:pattern-groups [{:patterns [[:ea ?movie-0]]}],
                           :join-sym ?movie-0}}]}}}
                   (->> (#'rs/get-datalog-cache-for-app @store-conn app-id)
                        (resolvers/walk-friendly r)
                        keys
                        set)))))))))

(deftest refresh-cleans-up-stray-datalog-queries
  (with-movies-app
    (fn [{app-id :id :as _app} r]
      (with-session
        (fn [store-conn _eph-store-atom {{sess-id :id :as socket} :socket}]
          (blocking-send-msg socket {:op :init :app-id app-id})
          (let [john-uuid (resolvers/->uuid r "eid-john-mctiernan")
                ted-uuid (resolvers/->uuid r "eid-ted-kotcheff")
                kw-q {:movie {:$ {:where {:director john-uuid}}}}]
            (blocking-send-msg socket
                               {:op :add-query
                                :q kw-q})

            ;; No stale queries at first
            ;; datalog-cache, subs, instaql look good
            (is (empty? (rs/get-stale-instaql-queries @store-conn sess-id)))
            (is (= '#{{:children
                       {:pattern-groups
                        [{:patterns [[:vae ?movie-0 :movie/director "eid-john-mctiernan"]],
                          :children
                          {:pattern-groups [{:patterns [[:ea ?movie-0]]}],
                           :join-sym ?movie-0}}]}}}
                   (->> (#'rs/get-datalog-cache-for-app @store-conn app-id)
                        (resolvers/walk-friendly r)
                        keys
                        set)))
            (is (= '{{:movie {:$ {:where {:director "eid-john-mctiernan"}}}}
                     #{{:children
                        {:pattern-groups
                         [{:patterns
                           [[:vae ?movie-0 :movie/director "eid-john-mctiernan"]],
                           :children
                           {:pattern-groups [{:patterns [[:ea ?movie-0]]}],
                            :join-sym ?movie-0}}]}}}}
                   (->> (#'rs/get-subscriptions-for-app-id @store-conn app-id)
                        (resolvers/walk-friendly r)
                        pretty-subs)))

            ;; do mutation
            (tx/transact! aurora/conn-pool
                          app-id
                          [[:retract-triple
                            (resolvers/->uuid r "eid-predator")
                            (resolvers/->uuid r :movie/director)
                            john-uuid]
                           [:add-triple
                            (resolvers/->uuid r "eid-predator")
                            (resolvers/->uuid r :movie/director)
                            ted-uuid]])

            ;; mark topic as stale
            (rs/mark-stale-topics! store-conn
                                   app-id
                                   0
                                   [(d/pat->coarse-topic
                                     [:vae '_ '_ john-uuid])])

            ;; send refresh
            (blocking-send-refresh socket {:op :refresh})

            ;; data is cleaned
            (is (empty? (rs/get-stale-instaql-queries @store-conn sess-id)))
            (is (= '#{{:children
                       {:pattern-groups
                        [{:patterns [[:vae ?movie-0 :movie/director "eid-john-mctiernan"]],
                          :children
                          {:pattern-groups [{:patterns [[:ea ?movie-0]]}],
                           :join-sym ?movie-0}}]}}}
                   (->> (#'rs/get-datalog-cache-for-app @store-conn app-id)
                        (resolvers/walk-friendly r)
                        keys
                        set)))
            (is (= '{{:movie {:$ {:where {:director "eid-john-mctiernan"}}}}
                     #{{:children
                        {:pattern-groups
                         [{:patterns
                           [[:vae ?movie-0 :movie/director "eid-john-mctiernan"]],
                           :children
                           {:pattern-groups [{:patterns [[:ea ?movie-0]]}],
                            :join-sym ?movie-0}}]}}}}
                   (->> (#'rs/get-subscriptions-for-app-id @store-conn app-id)
                        (resolvers/walk-friendly r)
                        pretty-subs)))))))))

(deftest transact-requires-auth
  (with-session
    (fn
      [_store-conn _eph-store-atom {:keys [socket]}]
      (is (= 400
             (:status (blocking-send-msg
                       socket {:op :transact :tx-steps []})))))))

(deftest transact-rejects-malformed
  (with-empty-app
    (fn [{app-id :id}]
      (with-session
        (fn
          [_store-conn _eph-store-atom {:keys [socket]}]
          (blocking-send-msg socket {:op :init :app-id app-id})
          (is (= 400
                 (:status (blocking-send-msg
                           socket {:op :transact
                                   :tx-steps [["moop" 1 2 3]]})))))))))

(deftest transact-works
  (with-movies-app
    (fn [{app-id :id :as _app} r]
      (with-session
        (fn [_ _ {:keys [socket]}]
          (blocking-send-msg socket {:op :init :app-id app-id})
          (let [robocop-eid (resolvers/->uuid r "eid-robocop")
                name-attr-id (resolvers/->uuid r :movie/title)]
            (is (= :transact-ok
                   (:op (blocking-send-msg
                         socket {:op :transact
                                 :tx-steps
                                 [["add-triple" robocop-eid name-attr-id "RoboDrizzle"]]}))))
            (let [resp (blocking-send-msg socket {:op :add-query
                                                  :q (:kw-q query-1987)})]
              (is (contains? (->> resp
                                  :result
                                  (mapcat iq/data-seq)
                                  (map :datalog-result)
                                  (mapcat :join-rows)

                                  (#(apply concat %))
                                  ;; last set of rows, drop time, get value
                                  (map (comp last drop-last))
                                  set)
                             "RoboDrizzle")))))))))

(deftest join-room-works
  (with-session
    (fn [_store-conn eph-store-atom {:keys [socket]}]
      (blocking-send-msg socket {:op :init :app-id movies-app-id})
      (let [rid (UUID/randomUUID)
            sess-id (:id socket)
            {:keys [op room-id]} (blocking-send-msg socket
                                                    {:op :join-room
                                                     :room-id rid})]

        (is (= :join-room-ok op))
        (is (= rid room-id))
        (is (= sess-id
               (-> (get-in @eph-store-atom [:rooms movies-app-id rid :session-ids])
                   first)))
        (is (= rid
               (-> (get-in @eph-store-atom [:sessions sess-id :room-ids])
                   first)))))))

(deftest leave-room-works
  (with-session
    (fn [_store-conn eph-store-atom {:keys [socket]}]
      (blocking-send-msg socket {:op :init :app-id movies-app-id})
      (let [rid (UUID/randomUUID)
            sess-id (:id socket)]
        (blocking-send-msg socket
                           {:op :join-room :room-id rid})

        ;; session is in the room

        (is (= sess-id
               (-> (get-in @eph-store-atom [:rooms movies-app-id rid :session-ids])
                   first)))

        (let [{:keys [op room-id]} (blocking-send-msg socket
                                                      {:op :leave-room
                                                       :room-id rid})]
          ;; session is no longer in the room
          (is (= :leave-room-ok op))
          (is (= rid room-id))
          (is (empty? (get-in @eph-store-atom [:rooms movies-app-id rid :session-ids])))
          (is (empty? (get-in @eph-store-atom [:sessions sess-id :room-ids])))
          (testing "store gets cleaned up"
            (is (= {} @eph-store-atom))))))))

(deftest get-changed-rooms-works
  (with-session
    (fn [_store-conn eph-store-atom {:keys [socket second-socket]}]
      (blocking-send-msg socket {:op :init :app-id movies-app-id})
      (blocking-send-msg second-socket {:op :init :app-id movies-app-id})
      (let [rid (UUID/randomUUID)
            initial-rooms (get-in @eph-store-atom [:rooms])
            join-room (blocking-send-msg socket
                                         {:op :join-room :room-id rid})
            _ (is (= :join-room-ok
                     (:op join-room)))
            join-room-2 (blocking-send-msg second-socket
                                           {:op :join-room
                                            :room-id rid})
            _ (is (= :join-room-ok
                     (:op join-room-2)))
            after-join-rooms (get-in @eph-store-atom [:rooms])
            _ (swap! eph-store-atom assoc :hello "hello")
            after-hello-rooms (get-in @eph-store-atom [:rooms])
            leave-room (blocking-send-msg socket
                                          {:op :leave-room :room-id rid})
            _ (is (= :leave-room-ok
                     (:op leave-room)))
            after-leave-rooms (get-in @eph-store-atom [:rooms])
            leave-room-2 (blocking-send-msg second-socket
                                            {:op :leave-room :room-id rid})
            _ (is (= :leave-room-ok
                     (:op leave-room-2)))
            after-room-empty (get-in @eph-store-atom [:rooms])]

        ;; changed rooms should be non-empty when joining
        (blocking-send-msg socket {:op :join-room :room-id rid})
        (is (seq (eph/get-changed-rooms initial-rooms after-join-rooms)))

        ;; changed rooms should be empty after non-room change
        (is (empty? (eph/get-changed-rooms after-join-rooms after-hello-rooms)))

        ;; changed rooms should be non-empty when someone leaves (unless it's the last person)
        (is (seq (eph/get-changed-rooms after-hello-rooms after-leave-rooms)))

        ;; changed rooms should be empty when the last person leaves
        (is (empty? (eph/get-changed-rooms after-hello-rooms after-room-empty)))))))

(deftest set-presence-works
  (with-session
    (fn [_store-conn eph-store-atom {:keys [socket]}]
      (let [rid (UUID/randomUUID)
            sess-id (:id socket)
            d1 {:hello "world"}
            d2 {:foo "bar"}]
        (blocking-send-msg socket {:op :init :app-id movies-app-id})
        (blocking-send-msg socket {:op :join-room :room-id rid})

        ;; session is in the room
        (is (= sess-id
               (-> (get-in @eph-store-atom [:rooms movies-app-id rid :session-ids])
                   first)))

        ;; session data is empty
        (is (= {:peer-id sess-id
                :user nil
                :data {}} (get-in @eph-store-atom [:rooms movies-app-id rid :data sess-id])))

        ;; session data is now set!
        (blocking-send-msg socket {:op :set-presence :room-id rid :data d1})
        (is (= {:peer-id sess-id
                :user nil
                :data d1} (get-in @eph-store-atom [:rooms movies-app-id rid :data sess-id])))

        ;; session data is overwritten!
        (blocking-send-msg socket {:op :set-presence :room-id rid :data d2})
        (is (= {:peer-id sess-id
                :user nil
                :data  d2} (get-in @eph-store-atom [:rooms movies-app-id rid :data sess-id])))))))

(deftest set-presence-fails-when-not-in-room
  (with-session
    (fn [_store-conn _eph-store-atom {:keys [socket]}]
      (blocking-send-msg socket {:op :init :app-id movies-app-id})
      (let [rid (UUID/randomUUID)
            d1 {:hello "world"}
            {:keys [op status]} (blocking-send-msg socket {:op :set-presence :room-id rid :data d1})]
        (is (= :error op))
        (is (= 400 status))))))

(deftest broadcast-works
  (with-session
    (fn [_store-conn eph-store-atom {:keys [socket]}]
      (let [rid (UUID/randomUUID)
            sess-id (:id socket)
            t1 "foo"
            d1 {:hello "world"}]
        (blocking-send-msg socket {:op :init :app-id movies-app-id})
        (blocking-send-msg socket {:op :join-room :room-id rid})
        (let [after-join-rooms (get-in @eph-store-atom [:rooms])
              {:keys [op room-id topic data]}
              (blocking-send-msg socket
                                 {:op :client-broadcast
                                  :room-id rid
                                  :topic t1
                                  :data d1})]

          ;; broadcast is okay
          (is (= :client-broadcast-ok op))
          (is (= rid room-id))
          (is (= t1 topic))
          (is (= {:peer-id sess-id
                  :user nil
                  :data d1} data))

          ;; Rooms should be unchanged after broadcast
          (is (= after-join-rooms (get-in @eph-store-atom [:rooms]))))))))

(deftest broadcast-fails-when-not-in-room
  (with-session
    (fn [_store-conn _eph-store-atom {:keys [socket]}]
      (blocking-send-msg socket {:op :init :app-id movies-app-id})
      (let [rid (UUID/randomUUID)
            t1 "foo"
            d1 {:hello "world"}
            {:keys [op status]} (blocking-send-msg socket {:op :client-broadcast
                                                           :room-id rid
                                                           :topic t1
                                                           :data d1})]
        (is (= :error op))
        (is (= 400 status))))))

(comment
  (test/run-tests *ns*))
