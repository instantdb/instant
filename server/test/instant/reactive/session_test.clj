(ns instant.reactive.session-test
  (:require
   [clojure.core.async :as a]
   [clojure.java.io :as io]
   [clojure.test :as test :refer [deftest is testing]]
   [datascript.core :as ds]
   [instant.config :as config]
   [instant.data.resolvers :as resolvers]
   [instant.db.datalog :as d]
   [instant.db.instaql :as iq]
   [instant.db.model.attr :as attr-model]
   [instant.db.transaction :as tx]
   [instant.fixtures :refer [with-empty-app with-movies-app with-zeneca-app]]
   [instant.flags :as flags]
   [instant.grouped-queue :as grouped-queue]
   instant.isn
   [instant.jdbc.aurora :as aurora]
   [instant.lib.ring.websocket :as ws]
   [instant.model.app-stream :as app-stream-model]
   [instant.model.rule :as rule-model]
   [instant.reactive.ephemeral :as eph]
   [instant.reactive.query :as rq]
   [instant.reactive.receive-queue :as receive-queue]
   [instant.reactive.session :as session]
   [instant.reactive.store :as rs]
   [instant.storage.s3 :as s3]
   [instant.util.async :as ua]
   [instant.util.cache :as cache]
   [instant.util.coll :as ucoll]
   [instant.util.test :as test-util])
  (:import
   (com.hazelcast.core HazelcastInstance)
   (java.io ByteArrayOutputStream InputStream)
   (java.util UUID)))

(test/use-fixtures :each
  (fn [f]
    (binding [config/*env* :test]
      (f))))

(def ^:private non-existent-app-id
  #uuid "39b33777-3324-42dd-8f47-ce41d246c5a6")

(def ^:dynamic *store*
  nil)

(def ^:dynamic *instaql-query-results*
  nil)

(defn- with-session [f]
  (with-movies-app
    (fn [{movies-app-id :id} movies-resolver]
      (with-zeneca-app
        (fn [{zeneca-app-id :id} zeneca-resolver]
          (let [store (rs/init)

                receive-q
                (grouped-queue/start {:group-key-fn session/group-key
                                      :combine-fn   session/combine
                                      :process-fn   #(session/straight-jacket-process-receive-q-event store %1 %2)
                                      :max-workers  1})

                realized-eph?   (atom false)
                eph-hz          (delay
                                  (reset! realized-eph? true)
                                  @(future ;; avoid pinning vthread
                                     (eph/init-hz :test
                                                  store
                                                  (let [id (+ 100000 (rand-int 900000))]
                                                    {:instance-name (str "test-instance-" id)
                                                     :cluster-name  (str "test-cluster-" id)}))))
                eph-room-maps   (atom {})
                socket          {:id               (random-uuid)
                                 :ws-conn          (a/chan 100)
                                 :receive-q        receive-q
                                 :ping-job         (future)
                                 :pending-handlers (session/create-pending-handlers)}
                socket-2        {:id               (random-uuid)
                                 :ws-conn          (a/chan 100)
                                 :receive-q        receive-q
                                 :ping-job         (future)
                                 :pending-handlers (session/create-pending-handlers)}
                socket-3        {:id               (random-uuid)
                                 :ws-conn          (a/chan 100)
                                 :receive-q        receive-q
                                 :ping-job         (future)
                                 :pending-handlers (session/create-pending-handlers)}
                query-reactive  rq/instaql-query-reactive!]
            (session/on-open store socket)
            (session/on-open store socket-2)
            (session/on-open store socket-3)

            (binding [*store*                 store
                      *instaql-query-results* (atom {})]
              (with-redefs [receive-queue/receive-q receive-q
                            eph/room-maps           eph-room-maps
                            eph/hz                  eph-hz
                            ws/send-json!           (fn [_app-id msg fake-ws-conn]
                                                      (a/put! fake-ws-conn msg))
                            rq/instaql-query-reactive!
                            (fn [store {:keys [session-id] :as base-ctx} instaql-query return-type inference?]
                              (let [res (query-reactive store base-ctx instaql-query return-type inference?)]
                                (swap! *instaql-query-results* assoc-in [session-id instaql-query] res)
                                res))]
                (try
                  (f store {:socket   socket
                            :socket-2 socket-2
                            :socket-3 socket-3
                            :movies-app-id movies-app-id
                            :movies-resolver movies-resolver
                            :zeneca-app-id zeneca-app-id
                            :zeneca-resolver zeneca-resolver})
                  (finally
                    (session/on-close store socket)
                    (session/on-close store socket-2)
                    (session/on-close store socket-3)
                    (grouped-queue/stop receive-q)
                    (when @realized-eph?
                      (HazelcastInstance/.shutdown (:hz @eph-hz)))))))))))))

(defn read-msg [{:keys [ws-conn id]}]
  (let [ret (ua/<!!-timeout ws-conn)]
    (if (= :timeout ret)
      (throw (ex-info "Timed out waiting for a response" {:id id}))
      (dissoc ret :client-event-id :trace-id))))

(defn- read-msgs [n socket]
  (set (repeatedly n #(read-msg socket))))

(defn- send-msg [socket msg]
  (session/handle-receive *store* (rs/session *store* (:id socket)) msg {}))

(defn- blocking-send-msg [expected-op socket msg]
  (send-msg socket msg)
  (let [ret (read-msg socket)]
    (is (= expected-op (:op ret)))
    (dissoc ret :trace-id)))

(defn- pretty-auth [{:keys [app user] :as _auth}]
  [(:title app) (:email user)])

(deftest anon-auth
  (with-session
    (fn [store {:keys [socket zeneca-app-id movies-app-id]
                {:keys [id]} :socket}]
      (testing "non-existent app"
        (is (= 400
               (:status (blocking-send-msg
                         :error
                         socket
                         {:op :init :app-id non-existent-app-id})))))
      (testing "existing app"
        (let [{op :op event-auth :auth} (blocking-send-msg :init-ok socket {:op :init :app-id zeneca-app-id})
              store-auth (-> (rs/session store id) :session/auth)]
          (is (= :init-ok op))
          (is (= ["empty-app" nil] (pretty-auth event-auth)))
          (is (= ["empty-app" nil] (pretty-auth store-auth)))))

      (testing "already authed"
        (is (= 400
               (:status (blocking-send-msg :error socket {:op :init :app-id movies-app-id}))))))))

(def ^:private query-1987
  {:kw-q  {:movie {:$ {:where {:year 1987}}}}
   :client-resp '({:data
                   {:datalog-result
                    {:join-rows
                     #{#{("eid-lethal-weapon" :movie/title "Lethal Weapon")
                         ("eid-robocop" :movie/id "eid-robocop")
                         ("eid-lethal-weapon" :movie/id "eid-lethal-weapon")
                         ("eid-predator" :movie/id "eid-predator")
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
                     #{#{("eid-robocop" :movie/id "eid-robocop")
                         ("eid-robocop" :movie/year 1987)
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

(defn- pretty-query [r session-id q]
  (let [res (->> *instaql-query-results*
                 deref
                 (#(get-in % [session-id q]))
                 :instaql-result
                 (resolvers/walk-friendly r))]
    (map remove-created-at res)))

(deftest add-query-requires-auth
  (with-session
    (fn [_store {:keys [socket]}]
      (is (= 400
             (:status (blocking-send-msg
                       :error
                       socket {:op :add-query :q (:kw-q query-1987)})))))))

(deftest add-malformed-query-rejected
  (with-session
    (fn [_store {:keys [socket movies-app-id]}]
      (blocking-send-msg :init-ok socket {:op :init :app-id movies-app-id})
      (testing "malformed query are rejected"
        (is (= 400
               (:status (blocking-send-msg :error socket {:op :add-query :q {:movie "Foo"}}))))))))

(deftest add-nil-query-rejected
  (with-session
    (fn [_store {:keys [socket movies-app-id]}]
      (blocking-send-msg :init-ok socket {:op :init :app-id movies-app-id})
      (testing "nil queries are rejected"
        (is (= 400
               (:status (blocking-send-msg :error socket {:op :add-query :q nil}))))))))

(deftest add-query-works
  (with-session
    (fn [_store {:keys [socket movies-app-id movies-resolver]}]
      (blocking-send-msg :init-ok socket {:op :init :app-id movies-app-id})

      (testing "add query: movies in 1987"
        (let [{:keys [op q result]} (blocking-send-msg :add-query-ok
                                                       socket
                                                       {:op :add-query
                                                        :q (:kw-q query-1987)})]
          (is (= op :add-query-ok))
          (is (= (:kw-q query-1987) q))
          (is (= (:client-resp query-1987)
                 (resolvers/walk-friendly movies-resolver (map remove-created-at result)))))))))

(defn- get-datalog-cache-for-app [store app-id]
  (let [conn (rs/app-conn store app-id)]
    (reduce-kv (fn [acc eid v]
                 (assoc acc (:datalog-query/query (ds/entity @conn eid)) v))
               {}
               (cache/as-map-async (:datalog-query-cache (meta conn))))))

(defn- get-subscriptions-for-app-id [store app-id]
  (let [db @(rs/app-conn store app-id)]
    (for [datom (ds/datoms db :aevt :subscription/app-id)
          :when (= app-id (:v datom))
          :let  [ent (ds/entity db (:e datom))]]
      {:app-id        (:subscription/app-id ent)
       :datalog-query (:datalog-query/query (:subscription/datalog-query ent))
       :instaql-query (:instaql-query/query (:subscription/instaql-query ent))
       :session-id    (:subscription/session-id ent)
       :v             (:subscription/v ent)})))

(deftest add-query-sets-store
  (with-session
    (fn [store {:keys [socket movies-app-id movies-resolver]
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
                      {:pattern-groups [{:patterns [[:ea ?movie-0 #{:movie/id
                                                                    :movie/year
                                                                    :movie/trivia
                                                                    :movie/title}]]}],
                       :join-sym ?movie-0}}]}}
                  {:children
                   {:pattern-groups
                    [{:patterns [[:ea ?movie-0 :movie/title "RoboCop"]],
                      :children
                      {:pattern-groups [{:patterns [[:ea ?movie-0 #{:movie/id
                                                                    :movie/year
                                                                    :movie/trivia
                                                                    :movie/title}]]}],
                       :join-sym ?movie-0}}]}}}
               (->> (get-datalog-cache-for-app store movies-app-id)
                    (resolvers/walk-friendly movies-resolver)
                    keys
                    set))))

      (testing "subs are set"
        (is (= '{{:movie {:$ {:where {:year 1987}}}}
                 #{{:children
                    {:pattern-groups
                     [{:patterns [[:ea ?movie-0 :movie/year 1987]],
                       :children
                       {:pattern-groups [{:patterns [[:ea ?movie-0 #{:movie/id
                                                                     :movie/year
                                                                     :movie/trivia
                                                                     :movie/title}]]}],
                        :join-sym ?movie-0}}]}}},
                 {:movie {:$ {:where {:title "RoboCop"}}}}
                 #{{:children
                    {:pattern-groups
                     [{:patterns [[:ea ?movie-0 :movie/title "RoboCop"]],
                       :children
                       {:pattern-groups [{:patterns [[:ea ?movie-0 #{:movie/id
                                                                     :movie/year
                                                                     :movie/trivia
                                                                     :movie/title}]]}],
                        :join-sym ?movie-0}}]}}}}
               (->> (get-subscriptions-for-app-id store movies-app-id)
                    (resolvers/walk-friendly movies-resolver)
                    pretty-subs))))

      (testing "instaql-queries are set"
        (is (= (:client-resp query-1987)
               (pretty-query movies-resolver id (:kw-q query-1987))))
        (is (= (:client-resp query-robocop)
               (pretty-query movies-resolver id (:kw-q query-robocop))))))))

(deftest add-duplicate-query-returns-query-exists
  (with-session
    (fn [_store {:keys [socket movies-app-id]}]
      (blocking-send-msg :init-ok socket {:op :init :app-id movies-app-id})
      (blocking-send-msg :add-query-ok socket {:op :add-query :q (:kw-q query-robocop)})
      (is (= {:op :add-query-exists,
              :q (:kw-q query-robocop)}
             (blocking-send-msg :add-query-exists socket {:op :add-query
                                                          :q (:kw-q query-robocop)}))))))

(deftest remove-query-works
  (with-session
    (fn [_store {:keys [socket movies-app-id]}]
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
    (fn [store {:keys [socket movies-app-id movies-resolver]}]
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
                      {:pattern-groups [{:patterns [[:ea ?movie-0 #{:movie/id
                                                                    :movie/year
                                                                    :movie/trivia
                                                                    :movie/title}]]}],
                       :join-sym ?movie-0}}]}}}
               (->> (get-datalog-cache-for-app store movies-app-id)
                    (resolvers/walk-friendly movies-resolver)
                    keys
                    set))))

      (testing "subs for query one are removed"
        (is (= '{{:movie {:$ {:where {:title "RoboCop"}}}}
                 #{{:children
                    {:pattern-groups
                     [{:patterns [[:ea ?movie-0 :movie/title "RoboCop"]],
                       :children
                       {:pattern-groups [{:patterns [[:ea ?movie-0 #{:movie/id
                                                                     :movie/year
                                                                     :movie/trivia
                                                                     :movie/title}]]}],
                        :join-sym ?movie-0}}]}}}}
               (some->> (get-subscriptions-for-app-id store movies-app-id)
                        seq
                        (resolvers/walk-friendly movies-resolver)
                        pretty-subs))))

      ;; okay, now for the second query
      (is (= {:op :remove-query-ok,
              :q (:kw-q query-robocop)}
             (blocking-send-msg :remove-query-ok
                                socket
                                {:op :remove-query
                                 :q (:kw-q query-robocop)})))

      (testing "all subs are gone"
        (is (empty? (get-subscriptions-for-app-id store movies-app-id))))

      (testing "datalog-cache is cleaned"
        (is (empty? (get-datalog-cache-for-app store movies-app-id)))))))

(deftest mark-stale-topics-works
  (with-movies-app
    (fn [{app-id :id :as _app} r]
      (with-session
        (fn [store {{sess-id :id :as socket} :socket}]
          (blocking-send-msg :init-ok socket {:op :init :app-id app-id})
          ;; Reset the tx-id before we test
          (rs/transact! "store/reset-tx-id"
                        (rs/app-conn store app-id)
                        [[:db.fn/call (fn [db]
                                        [[:db/add (ds/entid db [:tx-meta/app-id app-id]) :tx-meta/processed-tx-id 0]
                                         [:db/add (ds/entid db [:tx-meta/app-id app-id]) :tx-meta/processed-isn (instant.isn/test-isn 0)]])]])

          (blocking-send-msg :add-query-ok socket
                             {:op :add-query
                              :q (:kw-q query-1987)})

          ;; No stale queries at first
          (is (empty? (rs/get-stale-instaql-queries store app-id sess-id)))

          (rs/mark-stale-topics! store
                                 app-id
                                 5
                                 (instant.isn/test-isn 5)
                                 [(d/pat->coarse-topic
                                   [:ea
                                    (resolvers/->uuid r "eid-predator")])]
                                 {})

          ;; Now we have a stale query
          (is (= [(:kw-q query-1987)]
                 (map :instaql-query/query (rs/get-stale-instaql-queries store app-id sess-id))))

          ;; We also removed datalog queries from cache
          (is (= '#{}
                 (->> (get-datalog-cache-for-app store app-id)
                      (resolvers/walk-friendly r)
                      keys
                      set)))

          ;; we also recorded the tx-id and isn that was processed
          (is (= 5 (rs/get-processed-tx-id store app-id)))
          (is (= (instant.isn/test-isn 5) (rs/get-processed-isn store app-id))))))))

(deftest refresh-skip-attrs
  (with-movies-app
    (fn [{app-id :id :as _app} r]
      (with-session
        (fn [store {{sess-id :id :as socket} :socket}]
          (send-msg socket {:op :init
                            :app-id app-id
                            :versions {session/core-version-key "0.20.5"}})
          (let [ret (read-msg socket)]
            (is (= :init-ok (:op ret)))
            (is (contains? ret :attrs)))

          (blocking-send-msg :add-query-ok
                             socket
                             {:op :add-query
                              :q (:kw-q query-1987)})

          ;; mark topic as stale
          ;; clear the query hash so that the refresh will trigger a send
          (rs/mark-stale-topics! store
                                 app-id
                                 0
                                 (instant.isn/test-isn 0)
                                 [(d/pat->coarse-topic
                                   [:ea
                                    (resolvers/->uuid r "eid-predator")])]
                                 {})
          (ds/transact! (rs/app-conn store app-id)
                        [[:db/retract [:instaql-query/session-id+query [sess-id (:kw-q query-1987)]] :instaql-query/hash]])

          (testing "if attrs don't change, don't send them"
            (send-msg socket {:session-id (:id socket)
                              :op :refresh})
            (let [ret (read-msg socket)]
              (is (= :refresh-ok (:op ret)))
              (is (not (contains? ret :attrs)))))

          ;; change attrs
          (tx/transact! (aurora/conn-pool :write)
                        (attr-model/get-by-app-id app-id)
                        app-id
                        [[:add-attr {:id (random-uuid)
                                     :forward-identity [(random-uuid) "profile" "id"]
                                     :unique? true
                                     :index? false
                                     :value-type :blob
                                     :cardinality :one}]])

          ;; mark topic as stale
          ;; clear the query hash so that the refresh will trigger a send
          (rs/mark-stale-topics! store
                                 app-id
                                 0
                                 (instant.isn/test-isn 0)
                                 [(d/pat->coarse-topic
                                   [:ea
                                    (resolvers/->uuid r "eid-predator")])]
                                 {})
          (ds/transact! (rs/app-conn store app-id)
                        [[:db/retract [:instaql-query/session-id+query [sess-id (:kw-q query-1987)]] :instaql-query/hash]])

          (testing "if attrs change, they get send again"
            (send-msg socket {:session-id (:id socket)
                              :op :refresh})
            (let [ret (read-msg socket)]
              (is (= :refresh-ok (:op ret)))
              (is (contains? ret :attrs)))))))))

(deftest refresh-sends-attrs-when-schema-changes-without-queries
  (with-session
    (fn [_store {:keys [socket movies-app-id]}]
      (send-msg socket {:op :init
                        :app-id movies-app-id
                        :versions {session/core-version-key "0.20.5"}})
      (let [ret (read-msg socket)]
        (is (= :init-ok (:op ret)))
        (is (contains? ret :attrs)))

      (tx/transact! (aurora/conn-pool :write)
                    (attr-model/get-by-app-id movies-app-id)
                    movies-app-id
                    [[:add-attr {:id (random-uuid)
                                 :forward-identity [(random-uuid) "profile" "id"]
                                 :unique? true
                                 :index? false
                                 :value-type :blob
                                 :cardinality :one}]])

      (send-msg socket {:session-id (:id socket)
                        :op :refresh})
      (let [ret (read-msg socket)]
        (is (= :refresh-ok (:op ret)))
        (is (= [] (:computations ret)))
        (is (contains? ret :attrs))))))

(deftest refresh-populates-cache
  (with-movies-app
    (fn [{app-id :id :as _app} r]
      (with-session
        (fn [store {{sess-id :id :as socket} :socket}]
          (blocking-send-msg :init-ok socket {:op :init :app-id app-id})
          (blocking-send-msg :add-query-ok
                             socket
                             {:op :add-query
                              :q (:kw-q query-1987)})
          (rs/mark-stale-topics! store
                                 app-id
                                 0
                                 (instant.isn/test-isn 0)
                                 [(d/pat->coarse-topic
                                   [:ea
                                    (resolvers/->uuid r "eid-predator")])]
                                 {})

          (testing "send refresh"
            ;; clear the query hash so that the refresh will trigger a send
            (ds/transact! (rs/app-conn store app-id)
                          [[:db/retract [:instaql-query/session-id+query [sess-id (:kw-q query-1987)]] :instaql-query/hash]])
            (blocking-send-msg :refresh-ok socket {:session-id (:id socket)
                                                   :op :refresh})

            ;; After refresh there should be no more stale queries
            (is (empty? (rs/get-stale-instaql-queries store app-id sess-id)))

            ;; Datalog cache now has more things
            (is (= '#{{:children
                       {:pattern-groups
                        [{:patterns [[:ea ?movie-0 :movie/year 1987]],
                          :children
                          {:pattern-groups [{:patterns [[:ea ?movie-0 #{:movie/year
                                                                        :movie/id
                                                                        :movie/trivia
                                                                        :movie/title}]]}],
                           :join-sym ?movie-0}}]}}}
                   (->> (get-datalog-cache-for-app store app-id)
                        (resolvers/walk-friendly r)
                        keys
                        set)))))))))

(deftest refresh-cleans-up-stray-datalog-queries
  (with-movies-app
    (fn [{app-id :id :as _app} r]
      (with-session
        (fn [store {{sess-id :id :as socket} :socket}]
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
            (is (empty? (rs/get-stale-instaql-queries store app-id sess-id)))
            (is (= '#{{:children
                       {:pattern-groups
                        [{:patterns [[:vae ?movie-0 :movie/director "eid-john-mctiernan"]],
                          :children
                          {:pattern-groups [{:patterns [[:ea ?movie-0 #{:movie/year
                                                                        :movie/id
                                                                        :movie/trivia
                                                                        :movie/title}]]}],
                           :join-sym ?movie-0}}]}}}
                   (->> (get-datalog-cache-for-app store app-id)
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
                                                                         :movie/trivia
                                                                         :movie/title}]]}],
                            :join-sym ?movie-0}}]}}}}
                   (->> (get-subscriptions-for-app-id store app-id)
                        (resolvers/walk-friendly r)
                        pretty-subs)))

            ;; do mutation
            (tx/transact! (aurora/conn-pool :write)
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
            (rs/mark-stale-topics! store
                                   app-id
                                   0
                                   (instant.isn/test-isn 0)
                                   [(d/pat->coarse-topic
                                     [:vae '_ '_ john-uuid])]
                                   {})

            ;; send refresh
            (blocking-send-msg :refresh-ok socket {:session-id (:id socket)
                                                   :op :refresh})

            ;; data is cleaned
            (is (empty? (rs/get-stale-instaql-queries store app-id sess-id)))
            (is (= '#{{:children
                       {:pattern-groups
                        [{:patterns [[:vae ?movie-0 :movie/director "eid-john-mctiernan"]],
                          :children
                          {:pattern-groups [{:patterns [[:ea ?movie-0 #{:movie/year
                                                                        :movie/id
                                                                        :movie/trivia
                                                                        :movie/title}]]}],
                           :join-sym ?movie-0}}]}}}
                   (->> (get-datalog-cache-for-app store app-id)
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
                                                                         :movie/trivia
                                                                         :movie/title}]]}],
                            :join-sym ?movie-0}}]}}}}
                   (->> (get-subscriptions-for-app-id store app-id)
                        (resolvers/walk-friendly r)
                        pretty-subs)))))))))

(deftest transact-requires-auth
  (with-session
    (fn [_store {:keys [socket]}]
      (is (= 400
             (:status (blocking-send-msg
                       :error
                       socket {:op :transact :tx-steps []})))))))

(deftest transact-rejects-malformed
  (with-empty-app
    (fn [{app-id :id}]
      (with-session
        (fn [_store {:keys [socket]}]
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
        (fn [_store {:keys [socket]}]
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
    (fn [_store {:keys [socket movies-app-id]}]
      (blocking-send-msg :init-ok socket {:op :init
                                          :app-id movies-app-id})
      (let [rid (str (UUID/randomUUID))
            sess-id (:id socket)]

        (send-msg socket
                  {:op :join-room
                   :room-id rid})

        (let [msgs (read-msgs 2 socket)
              join-room-ok (ucoll/seek (fn [msg] (= :join-room-ok (:op msg))) msgs)]

          (is (= [:join-room-ok :refresh-presence]
                 (sort (map :op msgs))))

          (is join-room-ok)

          (is (= rid (:room-id join-room-ok)))
          (is (eph/in-room? movies-app-id rid sess-id)))))))

(deftest join-room-errors-on-invalid-room-id
  (with-session
    (fn [_store {:keys [socket movies-app-id]}]
      (blocking-send-msg :init-ok socket {:op :init
                                          :app-id movies-app-id})
      (send-msg socket
                {:op :join-room
                 :room-id nil})

      (let [msg (first (read-msgs 1 socket))]
        (is (= :error (:op msg)))
        (is (= :param-missing (:type msg)))))))

(deftest leave-room-works
  (with-session
    (fn [_store {:keys [socket movies-app-id]}]
      (send-msg socket {:op :init
                        :app-id movies-app-id})
      (is (= :init-ok (:op (read-msg socket))))

      (let [rid (str (UUID/randomUUID))
            sess-id (:id socket)]
        (send-msg socket {:op :join-room, :room-id rid})
        (is (= #{:join-room-ok :refresh-presence}
               (->> (read-msgs 2 socket) (map :op) set)))

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
    (fn [_store {:keys [socket movies-app-id]}]
      (let [rid     (str (UUID/randomUUID))
            sess-id (:id socket)
            d1      {:a "a" :b "b" :c "c" :d "d" :e "e"}
            d2      {:a "a" :b "b" :c "c" :e "E" :f "F"}]
        (send-msg socket {:op       :init
                          :app-id   movies-app-id
                          :versions {session/core-version-key "0.17.6"}})
        (is (= :init-ok (:op (read-msg socket))))

        (send-msg socket {:op :join-room :room-id rid})
        (is (= #{:join-room-ok :refresh-presence}
               (->> (read-msgs 2 socket) (map :op) set)))

        ;; session is in the room
        (is (eph/in-room? movies-app-id rid sess-id))

        ;; session data is empty
        (is (= {sess-id {:peer-id     sess-id
                         :instance-id "dev"
                         :user        nil
                         :data        {}}}
               (eph/get-room-data movies-app-id rid)))

        ;; set session data
        (send-msg socket {:op :set-presence, :room-id rid, :data d1})

        (is (= #{{:op :set-presence-ok, :room-id rid}
                 {:op      :patch-presence
                  :room-id rid
                  :edits   [[[sess-id :data] :r {:a "a" :b "b" :c "c" :d "d" :e "e"}]]}}
               (read-msgs 2 socket)))
        (is (= {sess-id {:peer-id     sess-id
                         :instance-id "dev"
                         :user        nil
                         :data        d1}}
               (eph/get-room-data movies-app-id rid)))

        ;; udpate session data
        (send-msg socket {:op :set-presence, :room-id rid, :data d2})
        (is (= #{{:op :set-presence-ok, :room-id rid}
                 {:op      :patch-presence
                  :room-id rid
                  :edits   [[[sess-id :data :d] :-]
                            [[sess-id :data :e] :r "E"]
                            [[sess-id :data :f] :+ "F"]]}}
               (read-msgs 2 socket)))
        (is (= {sess-id {:peer-id     sess-id
                         :instance-id "dev"
                         :user        nil
                         :data        d2}}
               (eph/get-room-data movies-app-id rid)))))))

(deftest set-presence-two-sessions
  (with-session
    (fn [_store {socket-1 :socket
                 socket-2 :socket-2
                 movies-app-id :movies-app-id}]
      (let [rid       (str (UUID/randomUUID))
            sess-id-1 (:id socket-1)
            sess-id-2 (:id socket-2)
            d1        {:a "a" :b "b" :c "c" :d "d" :e "e"}
            d2        {:a "a" :b "b" :c "c" :e "E" :f "F"}
            versions  {session/core-version-key "0.17.6"}]
        ;; socket-1 joining
        (send-msg socket-1 {:op :init, :app-id movies-app-id, :versions versions})
        (is (= :init-ok (:op (read-msg socket-1))))

        (send-msg socket-1 {:op :join-room, :room-id rid})
        (is (= #{{:op :join-room-ok, :room-id rid}
                 {:op :refresh-presence, :room-id rid, :data {sess-id-1 {:data {}, :instance-id "dev", :peer-id sess-id-1, :user nil}}}}
               (read-msgs 2 socket-1)))

        (send-msg socket-1 {:op :set-presence, :room-id rid, :data d1})
        (is (= #{{:op :set-presence-ok, :room-id rid}
                 {:op :patch-presence, :room-id rid, :edits [[[sess-id-1 :data] :r d1]]}}
               (read-msgs 2 socket-1)))

        ;; socket-2 joining
        (send-msg socket-2 {:op :init, :app-id movies-app-id, :versions versions})
        (is (= :init-ok (:op (read-msg socket-2))))

        (send-msg socket-2 {:op :join-room, :room-id rid})
        (is (= #{{:op :join-room-ok, :room-id rid}
                 {:op      :refresh-presence
                  :room-id rid
                  :data    {sess-id-1 {:data        d1
                                       :peer-id     sess-id-1
                                       :instance-id "dev"
                                       :user        nil}
                            sess-id-2 {:data        {}
                                       :peer-id     sess-id-2
                                       :instance-id "dev"
                                       :user        nil}}}}
               (read-msgs 2 socket-2)))
        (is (= {:op      :patch-presence
                :room-id rid
                :edits   [[[sess-id-2] :+ {:data        {}
                                           :peer-id     sess-id-2
                                           :instance-id "dev"
                                           :user        nil}]]}
               (read-msg socket-1)))

        ;; socket-1 updating
        (send-msg socket-1 {:op :set-presence, :room-id rid, :data d2})
        (is (= #{{:op      :set-presence-ok
                  :room-id rid}
                 {:op      :patch-presence
                  :room-id rid
                  :edits   [[[sess-id-1 :data :d] :-]
                            [[sess-id-1 :data :e] :r "E"]
                            [[sess-id-1 :data :f] :+ "F"]]}}
               (read-msgs 2 socket-1)))
        (is (= {:op      :patch-presence
                :room-id rid
                :edits   [[[sess-id-1 :data :d] :-]
                          [[sess-id-1 :data :e] :r "E"]
                          [[sess-id-1 :data :f] :+ "F"]]}
               (read-msg socket-2)))

        ;; socket-2 leaving
        (send-msg socket-2 {:op :leave-room, :room-id rid})
        (is (= {:op      :leave-room-ok
                :room-id rid}
               (read-msg socket-2)))
        (is (= {:op      :patch-presence
                :room-id rid
                :edits   [[[sess-id-2] :-]]}
               (read-msg socket-1)))

        ;; socket-1 updating
        (send-msg socket-1 {:op :set-presence, :room-id rid, :data d1})
        (is (= #{{:op      :set-presence-ok
                  :room-id rid}
                 {:op      :patch-presence
                  :room-id rid
                  :edits   [[[sess-id-1 :data :e] :r "e"]
                            [[sess-id-1 :data :f] :-]
                            [[sess-id-1 :data :d] :+ "d"]]}}
               (read-msgs 2 socket-1)))))))

(deftest set-presence-fails-when-not-in-room
  (with-session
    (fn [_store {:keys [socket movies-app-id]}]
      (blocking-send-msg :init-ok socket {:op :init :app-id movies-app-id})
      (let [rid (str (UUID/randomUUID))
            d1 {:hello "world"}
            {:keys [op status]} (blocking-send-msg :error socket {:op :set-presence :room-id rid :data d1})]
        (is (= :error op))
        (is (= 400 status))))))

(deftest broadcast-works
  (with-session
    (fn [_store {:keys [socket movies-app-id]}]
      (let [rid (str (UUID/randomUUID))
            sess-id (:id socket)
            t1 "foo"
            d1 {:hello "world"}]
        (blocking-send-msg :init-ok socket {:op :init :app-id movies-app-id})
        (is (= :join-room-ok (:op (blocking-send-msg :join-room-ok socket {:op :join-room, :room-id rid}))))
        (is (= :refresh-presence (:op (read-msg socket))))

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
    (fn [_store {:keys [socket movies-app-id]}]
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

;; -------
;; Streams

(defn with-file-mock [f]
  (let [files (atom {})
        upload (fn [_bucket {:keys [object-key]} file]
                 (let [ba (with-open [_in ^InputStream file
                                      out (ByteArrayOutputStream.)]
                            (io/copy file out)
                            (.toByteArray out))]
                   (swap! files assoc object-key ba)))
        get-metadata (fn [_bucket key]
                       {:size (alength ^bytes (get @files key))})]
    (test-util/with-s3-mock {:upload upload
                             :get-object-metadata get-metadata
                             :location-id-url (fn [app-id location-id]
                                                (str "https://example.com/" app-id "/" location-id))}
      (f {:slurp-file (fn [app-id location-id]
                        (-> @files
                            (get (s3/->object-key app-id location-id))
                            slurp))}))))

(defn read-full-stream
  "Reads the full stream, including any unflushed bytes from the buffer"
  [store app-id stream-id slurp-file]
  (let [stream-files (app-stream-model/get-stream-files {:app-id app-id
                                                         :stream-id stream-id})
        file-content (apply str (map (fn [{:keys [location-id]}]
                                       (slurp-file app-id location-id))
                                     stream-files))
        buffer-content (some->> (tool/inspect (rs/get-stream-object-for-subscribe store app-id stream-id))
                                deref
                                :buffer
                                (map (fn [^bytes ba]
                                       (String. ba "UTF-8")))
                                (apply str))]
    (str file-content buffer-content)))

(deftest streams-writer
  (with-file-mock
    (fn [{:keys [slurp-file]}]
      (with-session
        (fn [store {:keys [socket movies-app-id]}]
          (rule-model/put! {:app-id movies-app-id
                            :code {:$streams {:allow {:create "true" :view "true"}}}})
          (blocking-send-msg :init-ok socket {:op :init :app-id movies-app-id})
          (let [event-id (random-uuid)
                {:keys [stream-id]}
                (blocking-send-msg :start-stream-ok socket {:op :start-stream
                                                            :client-event-id event-id
                                                            :client-id "stream-1"
                                                            :reconnect-token (str (random-uuid))})]

            (is (uuid? stream-id))

            (send-msg socket {:op :append-stream
                              :stream-id (str stream-id)
                              :chunks ["Hello"]
                              :offset 0
                              :done false})

            (is (= "Hello" (read-full-stream store movies-app-id stream-id slurp-file)))

            (send-msg socket {:op :append-stream
                              :stream-id (str stream-id)
                              :chunks [" "]
                              :offset (count (.getBytes "Hello" "UTF-8"))
                              :done false})

            (is (= "Hello " (read-full-stream store movies-app-id stream-id slurp-file)))

            (let [{:keys [offset done]}
                  (blocking-send-msg :stream-flushed socket {:op :append-stream
                                                             :stream-id (str stream-id)
                                                             :chunks ["World"]
                                                             :offset (count (.getBytes "Hello " "UTF-8"))
                                                             :done true})
                  stream (app-stream-model/get-stream {:app-id movies-app-id
                                                       :client-id "stream-1"})
                  stream-files (app-stream-model/get-stream-files {:app-id movies-app-id
                                                                   :stream-id stream-id})]

              (is (= offset (count (.getBytes "Hello World" "UTF-8"))))
              (is done)
              (is (= (:size stream) offset))
              (is (:done stream))
              (is (= 1 (count stream-files)))
              (is (= offset (:size (first stream-files))))
              (is (= "Hello World" (read-full-stream store movies-app-id stream-id slurp-file)))
              (is (= "Hello World" (slurp-file movies-app-id (:location-id (first stream-files))))))))))))

(deftest streams-writer-flushes-to-files
  (with-redefs [flags/stream-flush-byte-limit (constantly 5)]
    (with-file-mock
      (fn [{:keys [slurp-file]}]
        (with-session
          (fn [store {:keys [socket movies-app-id]}]
            (rule-model/put! {:app-id movies-app-id
                              :code {:$streams {:allow {:create "true" :view "true"}}}})
            (blocking-send-msg :init-ok socket {:op :init :app-id movies-app-id})
            (let [event-id (random-uuid)
                  {:keys [stream-id]}
                  (blocking-send-msg :start-stream-ok socket {:op :start-stream
                                                              :client-event-id event-id
                                                              :client-id "stream-1"
                                                              :reconnect-token (random-uuid)})

                  {:keys [offset done]}
                  (blocking-send-msg :stream-flushed socket {:op :append-stream
                                                             :stream-id (str stream-id)
                                                             :chunks ["Hello"]
                                                             :offset 0})

                  stream-files (app-stream-model/get-stream-files {:app-id movies-app-id
                                                                   :stream-id stream-id})
                  _ (is (= "Hello" (read-full-stream store movies-app-id stream-id slurp-file)))
                  _ (is (= offset 5))
                  _ (is (= done false))
                  _ (is (= 1 (count stream-files)))
                  _ (is (= "Hello" (slurp-file movies-app-id (:location-id (first stream-files)))))

                  {:keys [offset done]}
                  (blocking-send-msg :stream-flushed socket {:op :append-stream
                                                             :stream-id (str stream-id)
                                                             :chunks ["World"]
                                                             :offset 5})
                  stream-files (app-stream-model/get-stream-files {:app-id movies-app-id
                                                                   :stream-id stream-id})

                  _ (is (= "HelloWorld" (read-full-stream store movies-app-id stream-id slurp-file)))

                  _ (is (= offset 10))
                  _ (is (= done false))
                  _ (is (= 2 (count stream-files)))
                  _ (is (= "World" (slurp-file movies-app-id (:location-id (second stream-files)))))

                  {:keys [offset done]}
                  (blocking-send-msg :stream-flushed socket {:op :append-stream
                                                             :stream-id (str stream-id)
                                                             :chunks ["Bye!"]
                                                             :offset 10
                                                             :done true})
                  stream-files (app-stream-model/get-stream-files {:app-id movies-app-id
                                                                   :stream-id stream-id})]

              (is (= offset 14))
              (is (= done true))
              (is (= 3 (count stream-files)))
              (is (= "HelloWorldBye!" (read-full-stream store movies-app-id stream-id slurp-file)))
              (is (= "Bye!" (slurp-file movies-app-id (:location-id (last stream-files))))))))))))

(deftest streams-writer-can-restart
  (with-redefs [flags/stream-flush-byte-limit (constantly 5)]
    (with-file-mock
      (fn [{:keys [slurp-file]}]
        (with-session
          (fn [store {:keys [socket socket-2 socket-3 movies-app-id]}]
            (rule-model/put! {:app-id movies-app-id
                              :code {:$streams {:allow {:create "true" :view "true"}}}})
            (blocking-send-msg :init-ok socket {:op :init :app-id movies-app-id})
            (blocking-send-msg :init-ok socket-2 {:op :init :app-id movies-app-id})
            (blocking-send-msg :init-ok socket-3 {:op :init :app-id movies-app-id})
            (let [event-id (random-uuid)
                  reconnect-token (str (random-uuid))
                  {:keys [stream-id]}
                  (blocking-send-msg :start-stream-ok socket {:op :start-stream
                                                              :client-event-id event-id
                                                              :client-id "stream-1"
                                                              :reconnect-token reconnect-token})


                  ;; Make sure part of the buffer gets flushed to a file
                  _ (blocking-send-msg :stream-flushed socket {:op :append-stream
                                                               :stream-id (str stream-id)
                                                               :chunks ["Hello"]
                                                               :offset 0})
                  ;; Make sure we still have some data buffered
                  _ (send-msg socket {:op :append-stream
                                      :stream-id (str stream-id)
                                      :chunks ["ABC"]
                                      :offset 5})

                  _ (is (= "HelloABC" (read-full-stream store movies-app-id stream-id slurp-file)))
                  _ (is (= 1 (count (app-stream-model/get-stream-files {:app-id movies-app-id
                                                                        :stream-id stream-id}))))

                  ;; simulate client going away
                  _ (session/on-close store socket)
                  ;; Now we only have the content from the files
                  _ (is (= "Hello" (read-full-stream store movies-app-id stream-id slurp-file)))

                  {:keys [offset]}
                  (blocking-send-msg :start-stream-ok socket-2 {:op :start-stream
                                                                :client-id "stream-1"
                                                                :reconnect-token (str reconnect-token)})
                  _ (is (= offset 5))

                  _ (send-msg socket-2 {:op :append-stream
                                        :stream-id (str stream-id)
                                        :chunks ["DEF"]
                                        :offset 5})
                  _ (is (= "HelloDEF" (read-full-stream store movies-app-id stream-id slurp-file)))]

              (testing "if someone steals our session, we can't write to it"
                (blocking-send-msg :start-stream-ok socket-3 {:op :start-stream
                                                              :client-id "stream-1"
                                                              :reconnect-token (str reconnect-token)})
                (blocking-send-msg :error socket-2 {:op :append-stream
                                                    :client-id "stream-1"
                                                    :chunks ["DEF"]
                                                    :offset 5})

                ;; socket-3 can write to it now
                (send-msg socket-3 {:op :append-stream
                                    :stream-id (str stream-id)
                                    :chunks ["DEF"]
                                    :offset 5})
                (is (= "HelloDEF" (read-full-stream store movies-app-id stream-id slurp-file)))))))))))
