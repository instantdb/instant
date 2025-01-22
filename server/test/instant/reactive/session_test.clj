(ns instant.reactive.session-test
  (:require
   [clojure.core.async :as a]
   [clojure.test :as test :refer [deftest is testing]]
   [datascript.core :as ds]
   [instant.config :as config]
   [instant.data.constants :refer [movies-app-id zeneca-app-id]]
   [instant.data.resolvers :as resolvers]
   [instant.db.datalog :as d]
   [instant.db.instaql :as iq]
   [instant.db.model.attr :as attr-model]
   [instant.db.transaction :as tx]
   [instant.flags :as flags]
   [instant.fixtures :refer [with-empty-app with-movies-app]]
   [instant.grouped-queue :as grouped-queue]
   [instant.jdbc.aurora :as aurora]
   [instant.lib.ring.websocket :as ws]
   [instant.reactive.ephemeral :as eph]
   [instant.reactive.query :as rq]
   [instant.reactive.receive-queue :as receive-queue]
   [instant.reactive.session :as session]
   [instant.reactive.store :as rs]
   [instant.util.async :as ua])
  (:import
   (com.hazelcast.core Hazelcast HazelcastInstance)
   (java.util UUID)))

(test/use-fixtures :each
  (fn [f]
    (binding [config/*env* :test]
      (f))))

(def ^:private r
  (delay
    (resolvers/make-movies-resolver)))

(def ^:private non-existent-app-id
  #uuid "39b33777-3324-42dd-8f47-ce41d246c5a6")

(def ^:dynamic *store-conn* nil)
(def ^:dynamic *instaql-query-results* nil)

(defn- with-session [f]
  (let [store-conn (rs/init-store)

        {receive-q :grouped-queue}
        (grouped-queue/start-grouped-queue-with-workers
         {:max-workers 1
          :group-fn session/group-fn
          :reserve-fn session/receive-worker-reserve-fn
          :process-fn (partial session/process-fn store-conn)})


        realized-eph?   (atom false)
        eph-hz          (delay
                          (reset! realized-eph? true)
                          @(future ;; avoid pinning vthread
                             (eph/init-hz :test
                                          store-conn
                                          (let [id (+ 100000 (rand-int 900000))]
                                            {:instance-name (str "test-instance-" id)
                                             :cluster-name  (str "test-cluster-" id)}))))
        eph-room-maps   (atom {})
        socket          {:id               (random-uuid)
                         :ws-conn          (a/chan 1)
                         :receive-q        receive-q
                         :ping-job         (future)
                         :pending-handlers (atom #{})}
        socket-2        {:id               (random-uuid)
                         :ws-conn          (a/chan 1)
                         :receive-q        receive-q
                         :ping-job         (future)
                         :pending-handlers (atom #{})}
        query-reactive  rq/instaql-query-reactive!]
    (session/on-open store-conn socket)
    (session/on-open store-conn socket-2)

    (binding [*store-conn*            store-conn
              *instaql-query-results* (atom {})]
      (with-redefs [receive-queue/receive-q receive-q
                    eph/room-maps           eph-room-maps
                    eph/hz                  eph-hz
                    ws/send-json!           (fn [_app-id msg fake-ws-conn]
                                              (a/put! fake-ws-conn msg))
                    rq/instaql-query-reactive!
                    (fn [store-conn {:keys [session-id] :as base-ctx} instaql-query return-type]
                      (let [res (query-reactive store-conn base-ctx instaql-query return-type)]
                        (swap! *instaql-query-results* assoc-in [session-id instaql-query] res)
                        res))]
        (try
          (f store-conn {:socket   socket
                         :socket-2 socket-2})

          (session/on-close store-conn socket)
          (session/on-close store-conn socket-2)
          (finally
            (when @realized-eph?
              (HazelcastInstance/.shutdown (:hz @eph-hz)))))))))

(defn read-msg [expected-op {:keys [ws-conn id] :as socket}]
  (let [ret (ua/<!!-timeout ws-conn 5000)]
    (assert (not= :timeout ret) "Timed out waiting for a response")
    (if (= expected-op (:op ret))
      (dissoc ret :client-event-id)
      (recur expected-op socket))))

(defn- blocking-send-msg [expected-op {:keys [ws-conn id] :as socket} msg]
  (session/handle-receive *store-conn* (rs/get-session @*store-conn* id) msg {})
  (read-msg expected-op socket))

(defn- blocking-send-refresh [{:keys [id] :as socket} msg]
  (blocking-send-msg :refresh-ok socket (assoc msg :session-id id)))

(defn- pretty-auth [{:keys [app user] :as _auth}]
  [(:title app) (:email user)])

(deftest anon-auth
  (with-session
    (fn [store-conn {:keys [socket]
                     {:keys [id]} :socket}]
      (testing "non-existent app"
        (is (= 400
               (:status (blocking-send-msg
                         :error
                         socket
                         {:op :init :app-id non-existent-app-id})))))
      (testing "existing app"
        (let [{op :op event-auth :auth} (blocking-send-msg :init-ok socket {:op :init :app-id zeneca-app-id})
              store-auth (rs/get-auth @store-conn id)]
          (is (= :init-ok op))
          (is (= ["Zeneca-ex" nil] (pretty-auth event-auth)))
          (is (= ["Zeneca-ex" nil] (pretty-auth store-auth)))))

      (testing "already authed"
        (is (= 400
               (:status (blocking-send-msg :error socket {:op :init :app-id movies-app-id}))))))))

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
    (fn [_store-conn {:keys [socket]}]
      (is (= 400
             (:status (blocking-send-msg
                       :error
                       socket {:op :add-query :q (:kw-q query-1987)})))))))

(deftest add-malformed-query-rejected
  (with-session
    (fn [_store-conn {:keys [socket]}]
      (blocking-send-msg :init-ok socket {:op :init :app-id movies-app-id})
      (testing "malformed query are rejected"
        (is (= 400
               (:status (blocking-send-msg :error socket {:op :add-query :q {:movie "Foo"}}))))))))

(deftest add-query-works
  (with-session
    (fn [_store-conn {:keys [socket]}]
      (blocking-send-msg :init-ok socket {:op :init :app-id movies-app-id})

      (testing "add query: movies in 1987"
        (let [{:keys [op q result]} (blocking-send-msg :add-query-ok
                                                       socket
                                                       {:op :add-query
                                                        :q (:kw-q query-1987)})]
          (is (= op :add-query-ok))
          (is (= (:kw-q query-1987) q))
          (is (= (:client-resp query-1987)
                 (resolvers/walk-friendly @r (map remove-created-at result)))))))))

(deftest add-query-sets-store
  (with-session
    (fn [store-conn {:keys [socket]
                     {:keys [id]} :socket}]
      (blocking-send-msg :init-ok socket {:op :init :app-id movies-app-id})
      (blocking-send-msg :add-query-ok
                         socket
                         {:op :add-query
                          :q (:kw-q query-1987)})
      (blocking-send-msg :add-query-ok
                         socket
                         {:op :add-query
                          :q (:kw-q query-robocop)})

      (testing "datalog-cache is set"
        (is (= '#{{:children
                   {:pattern-groups
                    [{:patterns [[:ea ?movie-0 :movie/year 1987]],
                      :children
                      {:pattern-groups [{:patterns [[:ea ?movie-0 #{:movie/year
                                                                    :movie/director
                                                                    :movie/sequel
                                                                    :movie/cast
                                                                    :movie/trivia
                                                                    :movie/title}]]}],
                       :join-sym ?movie-0}}]}}
                  {:children
                   {:pattern-groups
                    [{:patterns [[:ea ?movie-0 :movie/title "RoboCop"]],
                      :children
                      {:pattern-groups [{:patterns [[:ea ?movie-0 #{:movie/year
                                                                    :movie/director
                                                                    :movie/sequel
                                                                    :movie/cast
                                                                    :movie/trivia
                                                                    :movie/title}]]}],
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
                       {:pattern-groups [{:patterns [[:ea ?movie-0 #{:movie/year
                                                                     :movie/director
                                                                     :movie/sequel
                                                                     :movie/cast
                                                                     :movie/trivia
                                                                     :movie/title}]]}],
                        :join-sym ?movie-0}}]}}},
                 {:movie {:$ {:where {:title "RoboCop"}}}}
                 #{{:children
                    {:pattern-groups
                     [{:patterns [[:ea ?movie-0 :movie/title "RoboCop"]],
                       :children
                       {:pattern-groups [{:patterns [[:ea ?movie-0 #{:movie/year
                                                                     :movie/director
                                                                     :movie/sequel
                                                                     :movie/cast
                                                                     :movie/trivia
                                                                     :movie/title}]]}],
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
    (fn [_store-conn {:keys [socket]}]
      (blocking-send-msg :init-ok socket {:op :init :app-id movies-app-id})
      (blocking-send-msg :add-query-ok socket {:op :add-query :q (:kw-q query-robocop)})
      (is (= {:op :add-query-exists,
              :q (:kw-q query-robocop)}
             (blocking-send-msg :add-query-exists socket {:op :add-query
                                                          :q (:kw-q query-robocop)}))))))

(deftest remove-query-works
  (with-session
    (fn [_store-conn {:keys [socket]}]
      (blocking-send-msg :init-ok socket {:op :init :app-id movies-app-id})
      (blocking-send-msg :add-query-ok
                         socket
                         {:op :add-query
                          :q (:kw-q query-1987)})

      (is (= {:op :remove-query-ok,
              :q (:kw-q query-1987)}
             (blocking-send-msg :remove-query-ok
                                socket {:op :remove-query
                                        :q (:kw-q query-1987)}))))))

(deftest remove-query-updates-store
  (with-session
    (fn [store-conn {:keys [socket]}]
      (blocking-send-msg :init-ok socket {:op :init :app-id movies-app-id})

      (blocking-send-msg :add-query-ok
                         socket
                         {:op :add-query
                          :q (:kw-q query-1987)})

      (blocking-send-msg :add-query-ok
                         socket
                         {:op :add-query
                          :q (:kw-q query-robocop)})

      ;; okay, let's delete the first query
      (is (= {:op :remove-query-ok,
              :q (:kw-q query-1987)}
             (blocking-send-msg :remove-query-ok
                                socket
                                {:op :remove-query
                                 :q (:kw-q query-1987)})))

      (testing "stray datalog queries are removed"
        (is (= '#{{:children
                   {:pattern-groups
                    [{:patterns [[:ea ?movie-0 :movie/title "RoboCop"]],
                      :children
                      {:pattern-groups [{:patterns [[:ea ?movie-0 #{:movie/year
                                                                    :movie/director
                                                                    :movie/sequel
                                                                    :movie/cast
                                                                    :movie/trivia
                                                                    :movie/title}]]}],
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
                       {:pattern-groups [{:patterns [[:ea ?movie-0 #{:movie/year
                                                                     :movie/director
                                                                     :movie/sequel
                                                                     :movie/cast
                                                                     :movie/trivia
                                                                     :movie/title}]]}],
                        :join-sym ?movie-0}}]}}}}
               (some->> (#'rs/get-subscriptions-for-app-id @store-conn movies-app-id)
                        seq
                        (resolvers/walk-friendly @r)
                        pretty-subs))))

      ;; okay, now for the second query
      (is (= {:op :remove-query-ok,
              :q (:kw-q query-robocop)}
             (blocking-send-msg :remove-query-ok
                                socket
                                {:op :remove-query
                                 :q (:kw-q query-robocop)})))

      (testing "all subs are gone"
        (is (empty? (#'rs/get-subscriptions-for-app-id @store-conn movies-app-id))))

      (testing "datalog-cache is cleaned"
        (is (empty? (#'rs/get-datalog-cache-for-app @store-conn movies-app-id)))))))

(deftest mark-stale-topics-works
  (with-movies-app
    (fn [{app-id :id :as _app} r]
      (with-session
        (fn [store-conn {{sess-id :id :as socket} :socket}]
          (blocking-send-msg :init-ok socket {:op :init :app-id app-id})
          (blocking-send-msg :add-query-ok socket
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
                 (map :instaql-query/query (rs/get-stale-instaql-queries @store-conn sess-id))))

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
        (fn [store-conn {{sess-id :id :as socket} :socket}]
          (blocking-send-msg :init-ok socket {:op :init :app-id app-id})
          (blocking-send-msg :add-query-ok
                             socket
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
                          {:pattern-groups [{:patterns [[:ea ?movie-0 #{:movie/year
                                                                        :movie/id
                                                                        :movie/director
                                                                        :movie/sequel
                                                                        :movie/cast
                                                                        :movie/trivia
                                                                        :movie/title}]]}],
                           :join-sym ?movie-0}}]}}}
                   (->> (#'rs/get-datalog-cache-for-app @store-conn app-id)
                        (resolvers/walk-friendly r)
                        keys
                        set)))))))))

(deftest refresh-cleans-up-stray-datalog-queries
  (with-movies-app
    (fn [{app-id :id :as _app} r]
      (with-session
        (fn [store-conn {{sess-id :id :as socket} :socket}]
          (blocking-send-msg :init-ok socket {:op :init :app-id app-id})
          (let [john-uuid (resolvers/->uuid r "eid-john-mctiernan")
                ted-uuid (resolvers/->uuid r "eid-ted-kotcheff")
                kw-q {:movie {:$ {:where {:director john-uuid}}}}]
            (blocking-send-msg :add-query-ok
                               socket
                               {:op :add-query
                                :q kw-q})

            ;; No stale queries at first
            ;; datalog-cache, subs, instaql look good
            (is (empty? (rs/get-stale-instaql-queries @store-conn sess-id)))
            (is (= '#{{:children
                       {:pattern-groups
                        [{:patterns [[:vae ?movie-0 :movie/director "eid-john-mctiernan"]],
                          :children
                          {:pattern-groups [{:patterns [[:ea ?movie-0 #{:movie/year
                                                                        :movie/id
                                                                        :movie/director
                                                                        :movie/sequel
                                                                        :movie/cast
                                                                        :movie/trivia
                                                                        :movie/title}]]}],
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
                           {:pattern-groups [{:patterns [[:ea ?movie-0 #{:movie/year
                                                                         :movie/id
                                                                         :movie/director
                                                                         :movie/sequel
                                                                         :movie/cast
                                                                         :movie/trivia
                                                                         :movie/title}]]}],
                            :join-sym ?movie-0}}]}}}}
                   (->> (#'rs/get-subscriptions-for-app-id @store-conn app-id)
                        (resolvers/walk-friendly r)
                        pretty-subs)))

            ;; do mutation
            (tx/transact! (aurora/conn-pool)
                          (attr-model/get-by-app-id app-id)
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
                          {:pattern-groups [{:patterns [[:ea ?movie-0 #{:movie/year
                                                                        :movie/id
                                                                        :movie/director
                                                                        :movie/sequel
                                                                        :movie/cast
                                                                        :movie/trivia
                                                                        :movie/title}]]}],
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
                           {:pattern-groups [{:patterns [[:ea ?movie-0 #{:movie/year
                                                                         :movie/id
                                                                         :movie/director
                                                                         :movie/sequel
                                                                         :movie/cast
                                                                         :movie/trivia
                                                                         :movie/title}]]}],
                            :join-sym ?movie-0}}]}}}}
                   (->> (#'rs/get-subscriptions-for-app-id @store-conn app-id)
                        (resolvers/walk-friendly r)
                        pretty-subs)))))))))

(deftest transact-requires-auth
  (with-session
    (fn [_store-conn {:keys [socket]}]
      (is (= 400
             (:status (blocking-send-msg
                       :error
                       socket {:op :transact :tx-steps []})))))))

(deftest transact-rejects-malformed
  (with-empty-app
    (fn [{app-id :id}]
      (with-session
        (fn [_store-conn {:keys [socket]}]
          (blocking-send-msg :init-ok socket {:op :init :app-id app-id})
          (is (= 400
                 (:status (blocking-send-msg
                           :error
                           socket {:op :transact
                                   :tx-steps [["moop" 1 2 3]]})))))))))

(deftest transact-works
  (with-movies-app
    (fn [{app-id :id :as _app} r]
      (with-session
        (fn [_store-conn {:keys [socket]}]
          (blocking-send-msg :init-ok socket {:op :init :app-id app-id})
          (let [robocop-eid (resolvers/->uuid r "eid-robocop")
                name-attr-id (resolvers/->uuid r :movie/title)]
            (is (= :transact-ok
                   (:op (blocking-send-msg
                         :transact-ok
                         socket {:op :transact
                                 :tx-steps
                                 [["add-triple" robocop-eid name-attr-id "RoboDrizzle"]]}))))
            (let [resp (blocking-send-msg :add-query-ok
                                          socket {:op :add-query
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
    (fn [_store-conn {:keys [socket]}]
      (blocking-send-msg :init-ok socket {:op :init
                                          :app-id movies-app-id})
      (let [rid (str (UUID/randomUUID))
            sess-id (:id socket)
            {:keys [op room-id]} (blocking-send-msg :join-room-ok
                                                    socket
                                                    {:op :join-room
                                                     :room-id rid})]

        (is (= :join-room-ok op))
        (is (= rid room-id))
        (is (eph/in-room? movies-app-id rid sess-id))))))

(deftest leave-room-works
  (with-session
    (fn [_store-conn {:keys [socket]}]
      (blocking-send-msg :init-ok socket {:op :init
                                          :app-id movies-app-id})
      (let [rid (str (UUID/randomUUID))
            sess-id (:id socket)]
        (is (= :join-room-ok
               (:op (blocking-send-msg :join-room-ok socket {:op :join-room, :room-id rid}))))
        (is (= :refresh-presence (:op (read-msg :refresh-presence socket))))

        (is (eph/in-room? movies-app-id rid sess-id))

        (let [{:keys [op room-id]} (blocking-send-msg :leave-room-ok
                                                      socket
                                                      {:op :leave-room
                                                       :room-id rid})]
          ;; session is no longer in the room
          (is (= :leave-room-ok op))
          (is (= rid room-id))
          (is (not (eph/in-room? movies-app-id rid sess-id)))

          (is (empty? (:sessions @eph/room-maps)))
          (is (empty? (:rooms @eph/room-maps))))))))

(deftest patch-presence-works
  (with-session
    (fn [_store-conn {:keys [socket]}]
      (let [rid     (str (UUID/randomUUID))
            sess-id (:id socket)
            d1      {:a "a" :b "b" :c "c" :d "d" :e "e"}
            d2      {:a "a" :b "b" :c "c" :e "E" :f "F"}]
        (blocking-send-msg :init-ok socket {:op       :init
                                            :app-id   movies-app-id
                                            :versions {session/core-version-key "0.17.6"}})
        (is (= :join-room-ok (:op (blocking-send-msg :join-room-ok socket {:op :join-room :room-id rid}))))
        (is (= :refresh-presence (:op (read-msg :refresh-presence socket))))

        ;; session is in the room
        (is (eph/in-room? movies-app-id rid sess-id))

        ;; session data is empty
        (is (= {sess-id {:peer-id sess-id
                         :user nil
                         :data {}}}
               (eph/get-room-data movies-app-id rid)))

        ;; set session data
        (is (= :set-presence-ok (:op (blocking-send-msg :set-presence-ok socket {:op :set-presence :room-id rid :data d1}))))
        (is (= {:op      :patch-presence
                :room-id rid
                :edits   [[[sess-id :data] :r {:a "a" :b "b" :c "c" :d "d" :e "e"}]]}
               (read-msg :patch-presence socket)))
        (is (= {sess-id {:peer-id sess-id
                         :user    nil
                         :data    d1}}
               (eph/get-room-data movies-app-id rid)))

        ;; udpate session data
        (is (= :set-presence-ok (:op (blocking-send-msg :set-presence-ok socket {:op :set-presence :room-id rid :data d2}))))
        (is (= {:op      :patch-presence
                :room-id rid
                :edits   [[[sess-id :data :d] :-]
                          [[sess-id :data :e] :r "E"]
                          [[sess-id :data :f] :+ "F"]]}
               (read-msg :patch-presence socket)))
        (is (= {sess-id {:peer-id sess-id
                         :user    nil
                         :data    d2}}
               (eph/get-room-data movies-app-id rid)))))))

(deftest set-presence-two-sessions
  (with-session
    (fn [_store-conn {socket-1 :socket
                      socket-2 :socket-2}]
      (let [rid       (str (UUID/randomUUID))
            sess-id-1 (:id socket-1)
            sess-id-2 (:id socket-2)
            d1        {:a "a" :b "b" :c "c" :d "d" :e "e"}
            d2        {:a "a" :b "b" :c "c" :e "E" :f "F"}
            versions  {session/core-version-key "0.17.6"}]
        ;; socket-1 joining
        (blocking-send-msg :init-ok socket-1 {:op       :init
                                              :app-id   movies-app-id
                                              :versions versions})
        (is (= {:op      :join-room-ok
                :room-id rid}
               (blocking-send-msg :join-room-ok socket-1 {:op :join-room :room-id rid})))
        (is (= {:op      :refresh-presence
                :room-id rid
                :data    {sess-id-1 {:data    {}
                                     :peer-id sess-id-1
                                     :user    nil}}}
               (read-msg :refresh-presence socket-1)))
        (is (= {:op      :set-presence-ok
                :room-id rid}
               (blocking-send-msg :set-presence-ok socket-1 {:op :set-presence :room-id rid :data d1})))
        (is (= {:op      :patch-presence
                :room-id rid
                :edits   [[[sess-id-1 :data] :r d1]]}
               (read-msg :patch-presence socket-1)))

        ;; socket-2 joining
        (blocking-send-msg :init-ok socket-2 {:op       :init
                                              :app-id   movies-app-id
                                              :versions versions})
        (is (= {:op      :join-room-ok
                :room-id rid}
               (blocking-send-msg :join-room-ok socket-2 {:op :join-room :room-id rid})))
        (is (= {:op      :refresh-presence
                :room-id rid
                :data    {sess-id-1 {:data    d1
                                     :peer-id sess-id-1
                                     :user    nil}
                          sess-id-2 {:data    {}
                                     :peer-id sess-id-2
                                     :user    nil}}}
               (read-msg :refresh-presence socket-2)))

        (is (= {:op      :patch-presence
                :room-id rid
                :edits   [[[sess-id-2] :+ {:data {}
                                           :peer-id sess-id-2
                                           :user nil}]]}
               (read-msg :patch-presence socket-1)))

        ;; socket-1 updating
        (is (= {:op      :set-presence-ok
                :room-id rid}
               (blocking-send-msg :set-presence-ok socket-1 {:op :set-presence :room-id rid :data d2})))
        (is (= {:op      :patch-presence
                :room-id rid
                :edits   [[[sess-id-1 :data :d] :-]
                          [[sess-id-1 :data :e] :r "E"]
                          [[sess-id-1 :data :f] :+ "F"]]}
               (read-msg :patch-presence socket-1)))
        (is (= {:op      :patch-presence
                :room-id rid
                :edits   [[[sess-id-1 :data :d] :-]
                          [[sess-id-1 :data :e] :r "E"]
                          [[sess-id-1 :data :f] :+ "F"]]}
               (read-msg :patch-presence socket-2)))

        ;; socket-2 leaving
        (is (= {:op      :leave-room-ok
                :room-id rid}
               (blocking-send-msg :leave-room-ok socket-2 {:op :leave-room, :room-id rid})))
        (is (= {:op      :patch-presence
                :room-id rid
                :edits   [[[sess-id-2] :-]]}
               (read-msg :patch-presence socket-1)))

        ;; socket-1 updating
        (is (= {:op      :set-presence-ok
                :room-id rid}
               (blocking-send-msg :set-presence-ok socket-1 {:op :set-presence :room-id rid :data d1})))
        (is (= {:op      :patch-presence
                :room-id rid
                :edits   [[[sess-id-1 :data :e] :r "e"]
                          [[sess-id-1 :data :f] :-]
                          [[sess-id-1 :data :d] :+ "d"]]}
               (read-msg :patch-presence socket-1)))))))

(deftest set-presence-fails-when-not-in-room
  (with-session
    (fn [_store-conn {:keys [socket]}]
      (blocking-send-msg :init-ok socket {:op :init :app-id movies-app-id})
      (let [rid (str (UUID/randomUUID))
            d1 {:hello "world"}
            {:keys [op status]} (blocking-send-msg :error socket {:op :set-presence :room-id rid :data d1})]
        (is (= :error op))
        (is (= 400 status))))))

(deftest broadcast-works
  (with-session
    (fn [_store-conn {:keys [socket]}]
      (let [rid (str (UUID/randomUUID))
            sess-id (:id socket)
            t1 "foo"
            d1 {:hello "world"}]
        (blocking-send-msg :init-ok socket {:op :init :app-id movies-app-id})
        (is (= :join-room-ok (:op (blocking-send-msg :join-room-ok socket {:op :join-room, :room-id rid}))))
        (is (= :refresh-presence (:op (read-msg :refresh-presence socket))))

        (let [room-data (eph/get-room-data movies-app-id rid)
              {:keys [op room-id topic data]}
              (blocking-send-msg :client-broadcast-ok
                                 socket
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
          (is (= room-data
                 (eph/get-room-data movies-app-id rid))))))))

(deftest broadcast-fails-when-not-in-room
  (with-session
    (fn [_store-conn {:keys [socket]}]
      (blocking-send-msg :init-ok socket {:op :init :app-id movies-app-id})
      (let [rid (str (UUID/randomUUID))
            t1 "foo"
            d1 {:hello "world"}
            {:keys [op status]} (blocking-send-msg :error socket {:op :client-broadcast
                                                                  :room-id rid
                                                                  :topic t1
                                                                  :data d1})]
        (is (= :error op))
        (is (= 400 status))))))
