(ns instant.db.instaql-test
  (:require
   [clojure.test :as test :refer [deftest is are testing]]
   [instant.data.bootstrap :as bootstrap]
   [instant.data.constants :refer [zeneca-app-id]]
   [instant.data.resolvers :as resolvers]
   [instant.db.datalog :as d]
   [instant.db.instaql :as iq]
   [instant.db.model.attr :as attr-model]
   [instant.db.model.triple :as triple-model]
   [instant.db.transaction :as tx]
   [instant.fixtures :refer [with-empty-app
                             with-zeneca-app
                             with-zeneca-checked-data-app
                             with-zeneca-byop]]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.model.app :as app-model]
   [instant.model.app-user :as app-user-model]
   [instant.model.rule :as rule-model]
   [instant.reactive.query :refer [collect-instaql-results-for-client]]
   [instant.util.exception :as ex]
   [instant.util.instaql :refer [instaql-nodes->object-tree]]
   [instant.util.test :refer [instant-ex-data pretty-perm-q]])
  (:import
   (java.time Instant)
   (java.util UUID)))

(def ^:private r (delay (resolvers/make-zeneca-resolver)))

(def ^:private ctx
  (delay {:db {:conn-pool (aurora/conn-pool)}
          :app-id zeneca-app-id
          :attrs (attr-model/get-by-app-id zeneca-app-id)}))

(defn- ->pretty-node
  "Given a query node, flatten it into one ordered map of triples and topics.
   We interpose a handy '--' separator to signify a different node"
  [node]
  (let [r-seq (map :datalog-result (iq/data-seq node))
        r-topics (map :topics r-seq)
        r-join-rows (map :join-rows r-seq)
        r-sorted-triples (map (fn [join-rows]
                                (->> join-rows
                                     (mapcat identity)
                                     ;; drop time component
                                     (map (partial take 3))
                                     (sort-by str)))
                              r-join-rows)
        topics (->> r-topics
                    (interpose ['--])
                    (mapcat identity))

        triples (->> r-sorted-triples
                     (interpose ['--])
                     (mapcat identity))
        aggregates (map :aggregate r-seq)]
    (merge
     {:topics topics :triples triples}
     (when (seq aggregates)
       {:aggregate aggregates}))))

(defmacro is-pretty-eq?
  "InstaQL will execute in parallel.

   This means that it _is_ possible for nodes
   to come in different order.

   For example:
    for each user, get their bookshelves.

   Bookshelf queries could be executed in any order.

   This checks equality strictly based on
   the set of topics and triples in the result"
  [pretty-a pretty-b]
  `(do
     (testing "(topics is-pretty-eq?)"
       (is (= (set (mapcat :topics ~pretty-a))
              (set (mapcat :topics ~pretty-b)))))
     (testing "(triples is-pretty-eq?)"
       (is (= (set (mapcat :triples ~pretty-a))
              (set (mapcat :triples ~pretty-b)))))
     (testing "(aggregate is-pretty-eq?)"
       (is (= (set (remove nil? (mapcat :aggregate ~pretty-a)))
              (set (remove nil? (mapcat :aggregate ~pretty-b))))))))

(defn- query-pretty
  ([q]
   (query-pretty @ctx @r q))
  ([ctx q]
   (query-pretty ctx @r q))
  ([ctx r q]
   (->> q
        (iq/query ctx)
        (resolvers/walk-friendly r)
        (map ->pretty-node))))

(defn- validation-err
  ([q] (validation-err @ctx q))
  ([ctx q]
   (try (iq/query
         ctx
         q)
        (catch clojure.lang.ExceptionInfo e
          (-> (ex-data e)
              ::ex/hint
              :errors
              first)))))

(deftest validations
  (testing "not maps"
    (is (= '{:expected map? :in []}
           (validation-err 1)))
    (is (= '{:expected map? :in [:users :posts]}
           (validation-err {:users {:posts 2}}))))
  (testing "bad where clauses"
    (is (= '{:expected map?, :in [:users :$ :where]}
           (validation-err {:users {:$ {:where ["foo"]}}})))
    (is (= '{:expected supported-options?,
             :in [:users :$],
             :message "We only support `where`, `order`, `limit`, `offset`, `before`, and `after` clauses."}
           (validation-err {:users {:$ {:forgot-where ["foo"]}}})))
    (is (= '{:expected vector?, :in [0 :option-map :where-conds 0 1 :in]}
           (validation-err {:users {:$ {:where {:handle {:in {}}}}}})))
    (is (= '{:expected instant.db.instaql/where-value-valid-keys?,
             :in [0 :option-map :where-conds 0 1]}
           (validation-err {:users {:$ {:where {:handle {:is "stopa"}}}}})))
    (is (= '{:expected uuid?
             :in ["users" :$ :where "bookshelves"]
             :message "Expected bookshelves to be a uuid, got \"hello\""}
           (validation-err {:users
                            {:$ {:where {:bookshelves "hello"}}}})))
    (is (= '{:expected uuid?
             :in ["users" :$ :where "bookshelves"]
             :message "Expected bookshelves to match on a uuid, found \"hello\" in [\"hello\",\"00000000-0000-0000-0000-000000000000\"]"}
           (validation-err {:users
                            {:$ {:where {:bookshelves {:in ["00000000-0000-0000-0000-000000000000"
                                                            "hello"]}}}}})))

    (is (= '{:in [0 :option-map :where-conds 0 1 :$isNull], :expected boolean?}
           (validation-err {:users
                            {:$ {:where {:handle {:$isNull "a"}}}}}))))
  (testing "pagination"
    (is (= '{:expected supported-options?
             :in [:users :$ :limit],
             :message "The limit field must be a positive integer. Got -1."}
           (validation-err {:users
                            {:$ {:limit -1}}})))
    (is (= '{:expected join-row?
             :in [:users :$ :before],
             :message "Expected a join row for the cursor, got 10."}
           (validation-err {:users
                            {:$ {:before 10}}})))
    (is (= '{:expected supported-order?
             :in ["users" :$ :order],
             :message
             "There is no `random-field` attribute for users."}
           (validation-err {:users
                            {:$ {:order {:random-field "desc"}}}})))
    (is (= '{:expected valid-direction?,
             :in [:users :$ :order :serverCreatedAt],
             :message
             "We only support \"asc\" or \"desc\" in the `order` clause. Got \"DESC\"."}
           (validation-err {:users
                            {:$ {:order {:serverCreatedAt "DESC"}}}})))

    (is (= '{:message
             "We currently only support `limit`, `offset`, `before`, and `after` clauses on the top-level field.",
             :in [:users :bookshelves :$],
             :expected supported-options?}
           (validation-err {:users {:bookshelves {:$ {:limit 10}}}})))

    (is (= '{:expected supported-options?
             :in [:users :$],
             :message "Only provide one of `limit` or `first`."}
           (validation-err {:users
                            {:$ {:limit 10
                                 :first 10}}})))

    (is (= '{:expected supported-options?
             :in [:users :$],
             :message "Only provide one of `first` or `last`."}
           (validation-err {:users
                            {:$ {:last 10
                                 :first 10}}}))))

  (testing "aggregate"
    (is (= '{:expected admin?
             :in ["users" :$ :aggregate],
             :message "Aggregates are currently only available for admin queries."}
           (validation-err {:users
                            {:$ {:aggregate :count}}})))

    (is (= '{:expected valid-query?
             :in ["users" :$ :aggregate],
             :message "You can not combine aggregates with child queries at this time."}
           (validation-err (assoc @ctx :admin? true)
                           {:users
                            {:$ {:aggregate :count}
                             :bookshelves {}}})))))

(deftest validations-on-checked-data
  (with-empty-app
    (fn [app]
      (testing "checked-data-types"
        (tx/transact! (aurora/conn-pool)
                      (attr-model/get-by-app-id (:id app))
                      (:id app)
                      (for [t [:string :number :boolean :date]]
                        [:add-attr {:id (random-uuid)
                                    :forward-identity [(random-uuid) "etype" (name t)]
                                    :unique? false
                                    :index? true
                                    :value-type :blob
                                    :checked-data-type t
                                    :cardinality :one}]))
        (tx/transact! (aurora/conn-pool)
                      (attr-model/get-by-app-id (:id app))
                      (:id app)
                      [[:add-attr {:id (random-uuid)
                                   :forward-identity [(random-uuid) "etype" "unchecked"]
                                   :unique? false
                                   :index? false
                                   :value-type :blob
                                   :cardinality :one}]
                       [:add-attr {:id (random-uuid)
                                   :forward-identity [(random-uuid) "etype" "id"]
                                   :unique? true
                                   :index? false
                                   :value-type :blob
                                   :cardinality :one}]])
        (let [attrs (attr-model/get-by-app-id (:id app))
              ctx {:db {:conn-pool (aurora/conn-pool)}
                   :app-id (:id app)
                   :attrs attrs}]
          (is (= '{:expected? string?,
                   :in ["etype" :$ :where "string"],
                   :message
                   "The data type of `etype.string` is `string`, but the query got the value `1` of type `number`."}
                 (validation-err ctx {:etype {:$ {:where {:string 1}}}})))
          (is (= '{:expected? number?,
                   :in ["etype" :$ :where "number"],
                   :message
                   "The data type of `etype.number` is `number`, but the query got the value `\"hello\"` of type `string`."}
                 (validation-err ctx {:etype {:$ {:where {:number "hello"}}}})))
          (is (= '{:expected? boolean?,
                   :in ["etype" :$ :where "boolean"],
                   :message
                   "The data type of `etype.boolean` is `boolean`, but the query got the value `0` of type `number`."}
                 (validation-err ctx {:etype {:$ {:where {:boolean 0}}}})))
          (is (= '{:expected? timestamp?,
                   :in ["etype" :$ :where "date"],
                   :message
                   "The data type of `etype.date` is `date`, but the query got value `9999999999999999999999` of type `number`."}
                 (validation-err ctx {:etype {:$ {:where {:date 9999999999999999999999}}}})))
          (is (= '{:expected? date-string?,
                   :in ["etype" :$ :where "date"],
                   :message
                   "The data type of `etype.date` is `date`, but the query got value `\"tomorrow\"` of type `string`."}
                 (validation-err ctx {:etype {:$ {:where {:date "tomorrow"}}}})))

          (is (= '{:expected? string?
                   :in ["etype" :$ :where "string" :$gt],
                   :message
                   "The data type of `etype.string` is `string`, but the query got the value `10` of type `number`."}
                 (validation-err ctx {:etype {:$ {:where {:string {:$gt 10}}}}})))

          (is (= '{:expected? boolean?
                   :in ["etype" :$ :where "boolean" :$gt],
                   :message
                   "The data type of `etype.boolean` is `boolean`, but the query got the value `1` of type `number`."}
                 (validation-err ctx {:etype {:$ {:where {:boolean {:$gt 1}}}}})))

          (is (= '{:expected? string?
                   :in ["etype" :$ :where "string" :$like],
                   :message
                   "The $like value for `etype.string` must be a string, but the query got the value `10` of type `number`."}
                 (validation-err ctx {:etype {:$ {:where {:string {:$like 10}}}}})))

          (is (= '{:expected? string?
                   :in ["etype" :$ :where "string" :$ilike],
                   :message
                   "The $like value for `etype.string` must be a string, but the query got the value `10` of type `number`."}
                 (validation-err ctx {:etype {:$ {:where {:string {:$ilike 10}}}}})))

          (is (= '{:expected supported-order?,
                   :in ["etype" :$ :order],
                   :message
                   "The `etype.unchecked` attribute is not indexed. Only indexed and type-checked attrs can be used to order by."}
                 (validation-err ctx {:etype {:$ {:order {:unchecked "desc"}}}})))

          (is (= '{:expected valid-cursor?,
                   :in ["etype" :$ :after],
                   :message
                   "Invalid after cursor. The query orders by `string`, but the query that returned the cursor orders by `number`."}
                 (validation-err ctx {:etype
                                      {:$
                                       {:order {:string "desc"}
                                        :after [(random-uuid)
                                                (:id (attr-model/seek-by-fwd-ident-name
                                                      ["etype" "number"]
                                                      attrs))
                                                nil
                                                0]}}}))))))))

(deftest pagination
  (testing "limit"
    (is-pretty-eq? (query-pretty {:users {:$ {:limit 2
                                              :order {:serverCreatedAt :desc}}}})
                   '({:topics #{[:eav _ #{:users/id} _]
                                --
                                [:ea #{"eid-alex"} #{:users/bookshelves
                                                     :users/createdAt
                                                     :users/email
                                                     :users/id
                                                     :users/fullName
                                                     :users/handle} _]
                                [:ea #{"eid-joe-averbukh"} #{:users/bookshelves
                                                             :users/createdAt
                                                             :users/email
                                                             :users/id
                                                             :users/fullName
                                                             :users/handle} _]
                                [:ea #{"eid-joe-averbukh" "eid-alex"} #{:users/id} _]}
                      :triples #{("eid-joe-averbukh" :users/fullName "Joe Averbukh")
                                 ("eid-joe-averbukh" :users/handle "joe")
                                 ("eid-alex" :users/id "eid-alex")
                                 ("eid-alex" :users/createdAt "2021-01-09 18:53:07.993689")
                                 --
                                 ("eid-joe-averbukh" :users/id "eid-joe-averbukh")
                                 ("eid-alex" :users/fullName "Alex")
                                 ("eid-alex" :users/email "alex@instantdb.com")
                                 ("eid-alex" :users/handle "alex")
                                 ("eid-joe-averbukh" :users/email "joe@instantdb.com")
                                 ("eid-joe-averbukh" :users/createdAt "2021-01-07 18:51:23.742637")}})))

  (testing "limit with where"
    (is-pretty-eq? (query-pretty {:users {:$ {:where {:handle {:in ["joe" "stopa" "nicolegf"]}}
                                              :limit 2
                                              :order {:serverCreatedAt :desc}}}})
                   '({:topics #{[:ea #{"eid-joe-averbukh" "eid-stepan-parunashvili"} #{:users/id} _]
                                [:ea #{"eid-stepan-parunashvili"} #{:users/bookshelves
                                                                    :users/createdAt
                                                                    :users/email
                                                                    :users/id
                                                                    :users/fullName
                                                                    :users/handle}  _]
                                --
                                [:av _ #{:users/handle} #{"stopa" "joe" "nicolegf"}]
                                [:ea #{"eid-joe-averbukh"} #{:users/bookshelves
                                                             :users/createdAt
                                                             :users/email
                                                             :users/id
                                                             :users/fullName
                                                             :users/handle} _]}
                      :triples #{("eid-stepan-parunashvili" :users/email "stopa@instantdb.com")
                                 ("eid-joe-averbukh" :users/fullName "Joe Averbukh")
                                 ("eid-joe-averbukh" :users/handle "joe")
                                 ("eid-stepan-parunashvili"
                                  :users/createdAt
                                  "2021-01-07 18:50:43.447955")
                                 --
                                 ("eid-stepan-parunashvili" :users/fullName "Stepan Parunashvili")
                                 ("eid-stepan-parunashvili" :users/id "eid-stepan-parunashvili")
                                 ("eid-joe-averbukh" :users/id "eid-joe-averbukh")
                                 ("eid-stepan-parunashvili" :users/handle "stopa")
                                 ("eid-joe-averbukh" :users/email "joe@instantdb.com")
                                 ("eid-joe-averbukh" :users/createdAt "2021-01-07 18:51:23.742637")}})))

  (testing "makes sure we use distinct"
    (is-pretty-eq? (query-pretty {:users {:$ {:where {:bookshelves {:in
                                                                    ;; this will cause
                                                                    ;; multiple matches for `stopa`
                                                                    [(resolvers/->uuid @r "eid-worldview")
                                                                     (resolvers/->uuid @r "eid-the-way-of-the-gentleman")
                                                                     (resolvers/->uuid @r "eid-short-stories")
                                                                     (resolvers/->uuid @r "eid-2018")]}}
                                              :limit 3
                                              :order {:serverCreatedAt :asc}}}})

                   '({:topics
                      ([:vae
                        _
                        #{:users/bookshelves}
                        #{"eid-the-way-of-the-gentleman"
                          "eid-worldview"
                          "eid-short-stories"
                          "eid-2018"}]
                       [:ea
                        #{"eid-joe-averbukh" "eid-alex" "eid-stepan-parunashvili"}
                        #{:users/id}
                        _]
                       --
                       [:ea
                        #{"eid-stepan-parunashvili"}
                        #{:users/bookshelves
                          :users/createdAt
                          :users/email
                          :users/id
                          :users/fullName
                          :users/handle}
                        _]
                       --
                       [:ea
                        #{"eid-joe-averbukh"}
                        #{:users/bookshelves
                          :users/createdAt
                          :users/email
                          :users/id
                          :users/fullName
                          :users/handle}
                        _]
                       --
                       [:ea
                        #{"eid-alex"}
                        #{:users/bookshelves
                          :users/createdAt
                          :users/email
                          :users/id
                          :users/fullName
                          :users/handle}
                        _]),
                      :triples
                      (("eid-joe-averbukh" :users/bookshelves "eid-2018")
                       ("eid-alex" :users/id "eid-alex")
                       ("eid-alex" :users/bookshelves "eid-short-stories")
                       ("eid-stepan-parunashvili" :users/bookshelves "eid-worldview")
                       ("eid-joe-averbukh" :users/id "eid-joe-averbukh")
                       ("eid-stepan-parunashvili" :users/id "eid-stepan-parunashvili")
                       --
                       ("eid-stepan-parunashvili" :users/email "stopa@instantdb.com")
                       ("eid-stepan-parunashvili"
                        :users/createdAt
                        "2021-01-07 18:50:43.447955")
                       ("eid-stepan-parunashvili" :users/fullName "Stepan Parunashvili")
                       ("eid-stepan-parunashvili" :users/handle "stopa")
                       ("eid-stepan-parunashvili" :users/id "eid-stepan-parunashvili")
                       --
                       ("eid-joe-averbukh" :users/id "eid-joe-averbukh")
                       ("eid-joe-averbukh" :users/email "joe@instantdb.com")
                       ("eid-joe-averbukh" :users/handle "joe")
                       ("eid-joe-averbukh" :users/fullName "Joe Averbukh")
                       ("eid-joe-averbukh" :users/createdAt "2021-01-07 18:51:23.742637")
                       --
                       ("eid-alex" :users/id "eid-alex")
                       ("eid-alex" :users/fullName "Alex")
                       ("eid-alex" :users/email "alex@instantdb.com")
                       ("eid-alex" :users/handle "alex")
                       ("eid-alex" :users/createdAt "2021-01-09 18:53:07.993689")),
                      :aggregate (nil nil nil nil)})))

  (testing "offset"
    (is-pretty-eq? (query-pretty {:users {:$ {:offset 2
                                              :order {:serverCreatedAt :desc}}}})
                   '({:topics #{[:eav _ #{:users/id} _]
                                [:ea #{"eid-stepan-parunashvili"} #{:users/bookshelves
                                                                    :users/createdAt
                                                                    :users/email
                                                                    :users/id
                                                                    :users/fullName
                                                                    :users/handle} _]
                                [:ea #{"eid-nicole"} #{:users/bookshelves
                                                       :users/createdAt
                                                       :users/email
                                                       :users/id
                                                       :users/fullName
                                                       :users/handle} _]
                                --
                                [:ea
                                 #{"eid-stepan-parunashvili" "eid-nicole"}
                                 #{:users/id}
                                 _]}
                      :triples #{("eid-stepan-parunashvili" :users/email "stopa@instantdb.com")
                                 ("eid-nicole"
                                  :users/createdAt
                                  "2021-02-05 22:35:23.754264")
                                 ("eid-nicole" :users/id "eid-nicole")
                                 ("eid-stepan-parunashvili"
                                  :users/createdAt
                                  "2021-01-07 18:50:43.447955")
                                 ("eid-nicole" :users/fullName "Nicole")
                                 ("eid-nicole" :users/email "nicole@instantdb.com")
                                 --
                                 ("eid-nicole" :users/handle "nicolegf")
                                 ("eid-stepan-parunashvili" :users/fullName "Stepan Parunashvili")
                                 ("eid-stepan-parunashvili" :users/id "eid-stepan-parunashvili")
                                 ("eid-stepan-parunashvili" :users/handle "stopa")}})))

  (testing "cursors"
    (let [{:keys [start-cursor end-cursor]}
          (-> (iq/query @ctx {:users {:$ {:limit 1
                                          :order {:serverCreatedAt :desc}}}})
              first
              :data
              :datalog-result
              :page-info)]
      (testing "after"
        (is-pretty-eq? (query-pretty {:users {:$ {:limit 1
                                                  :after end-cursor
                                                  :order {:serverCreatedAt :desc}}}})
                       '({:topics #{[:eav _ #{:users/id} _]
                                    --
                                    [:ea #{"eid-alex"} #{:users/bookshelves
                                                         :users/createdAt
                                                         :users/email
                                                         :users/id
                                                         :users/fullName
                                                         :users/handle} _]
                                    [:ea #{"eid-alex"} #{:users/id} _]}
                          :triples #{("eid-alex" :users/id "eid-alex")
                                     ("eid-alex" :users/createdAt "2021-01-09 18:53:07.993689")
                                     --
                                     ("eid-alex" :users/fullName "Alex")
                                     ("eid-alex" :users/email "alex@instantdb.com")
                                     ("eid-alex" :users/handle "alex")}})))

      (testing "before"
        (is-pretty-eq? (query-pretty {:users {:$ {:limit 1
                                                  :before start-cursor
                                                  :order {:serverCreatedAt :desc}}}})
                       '({:topics #{[:eav _ #{:users/id} _] [:ea _ #{:users/id} _]}
                          :triples #{}}))

        (is-pretty-eq? (query-pretty {:users {:$ {:limit 1
                                                  :before start-cursor
                                                  :order {:serverCreatedAt "asc"}}}})
                       '({:topics #{[:eav _ #{:users/id} _]
                                    [:ea #{"eid-nicole"} #{:users/bookshelves
                                                           :users/createdAt
                                                           :users/email
                                                           :users/id
                                                           :users/fullName
                                                           :users/handle} _]
                                    --
                                    [:ea #{"eid-nicole"} #{:users/id} _]}
                          :triples #{("eid-nicole"
                                      :users/createdAt
                                      "2021-02-05 22:35:23.754264")
                                     ("eid-nicole" :users/id "eid-nicole")
                                     ("eid-nicole" :users/fullName "Nicole")
                                     ("eid-nicole" :users/email "nicole@instantdb.com")
                                     --
                                     ("eid-nicole" :users/handle "nicolegf")}})))

      (testing "last"
        (is-pretty-eq? (query-pretty {:users {:$ {:limit 1
                                                  :before start-cursor
                                                  :order {:serverCreatedAt :desc}}}})
                       '({:topics #{[:eav _ #{:users/id} _] [:ea _ #{:users/id} _]}
                          :triples #{}}))

        (is-pretty-eq? (query-pretty {:users {:$ {:last 1
                                                  :before start-cursor
                                                  :order {:serverCreatedAt "asc"}}}})
                       '({:topics #{[:eav _ #{:users/id} _]
                                    --
                                    [:ea #{"eid-alex"} #{:users/bookshelves
                                                         :users/createdAt
                                                         :users/email
                                                         :users/id
                                                         :users/fullName
                                                         :users/handle} _]
                                    [:ea #{"eid-alex"} #{:users/id} _]}
                          :triples #{("eid-alex" :users/id "eid-alex")
                                     ("eid-alex" :users/createdAt "2021-01-09 18:53:07.993689")
                                     --
                                     ("eid-alex" :users/fullName "Alex")
                                     ("eid-alex" :users/email "alex@instantdb.com")
                                     ("eid-alex" :users/handle "alex")}})))

      (let [alex-cursor (-> (iq/query @ctx {:users {:$ {:limit 1
                                                        :where {:handle "alex"}}}})
                            first
                            :data
                            :datalog-result
                            :page-info
                            :start-cursor)
            get-handles (fn [pagination-params]
                          (as-> (instaql-nodes->object-tree
                                 @ctx
                                 (iq/query @ctx {:users {:$ pagination-params}})) %
                            (get % "users")
                            (map #(get % "handle") %)
                            (set %)))
            get-page-info (fn [pagination-params]
                            (-> (iq/query @ctx {:users {:$ pagination-params}})
                                collect-instaql-results-for-client
                                first
                                :data
                                :page-info
                                (get "users")
                                (select-keys [:has-next-page?
                                              :has-previous-page?])))]
        ;; True order (in order of created) is nicolegf, stopa, alex, joe
        (is (= #{"stopa" "nicolegf" "joe" "alex"}
               (get-handles {:order {:serverCreatedAt "asc"}})))

        (is (= #{"stopa" "nicolegf"}
               (get-handles {:limit 2
                             :order {:serverCreatedAt "asc"}})))

        (is (= #{"alex" "stopa"}
               (get-handles {:limit 2
                             :offset 1
                             :order {:serverCreatedAt "asc"}})))

        (is (= #{"stopa"}
               (get-handles {:last 1
                             :before alex-cursor
                             :order {:serverCreatedAt "asc"}})))

        (is (= #{"stopa" "nicolegf"}
               (get-handles {:last 2
                             :before alex-cursor
                             :order {:serverCreatedAt "asc"}})))

        (is (= #{"joe"}
               (get-handles {:first 1
                             :after alex-cursor
                             :order {:serverCreatedAt "asc"}})))

        (is (= #{"stopa"}
               (get-handles {:first 1
                             :after alex-cursor
                             :order {:serverCreatedAt "desc"}})))

        (testing "has-next-page? and has-previous-page?"
          (is (= {:has-next-page? false
                  :has-previous-page? false}
                 (get-page-info {:order {:serverCreatedAt "asc"}})))

          (is (= {:has-next-page? true
                  :has-previous-page? false}
                 (get-page-info {:limit 2
                                 :order {:serverCreatedAt "asc"}})))

          (is (= {:has-next-page? true
                  :has-previous-page? true}
                 (get-page-info {:limit 2
                                 :offset 1
                                 :order {:serverCreatedAt "asc"}})))

          (is (= {:has-next-page? true
                  :has-previous-page? true}
                 (get-page-info {:last 1
                                 :before alex-cursor
                                 :order {:serverCreatedAt "asc"}})))

          (is (= {:has-next-page? true
                  :has-previous-page? false}
                 (get-page-info {:last 2
                                 :before alex-cursor
                                 :order {:serverCreatedAt "asc"}})))

          (is (= {:has-next-page? false
                  :has-previous-page? true}
                 (get-page-info {:first 1
                                 :after alex-cursor
                                 :order {:serverCreatedAt "asc"}})))

          (is (= {:has-next-page? true
                  :has-previous-page? true}
                 (get-page-info {:first 1
                                 :after alex-cursor
                                 :order {:serverCreatedAt "desc"}}))))))))

(deftest pagination-with-checked-fields
  (with-zeneca-checked-data-app
    (fn [app r]
      (let [ctx {:db {:conn-pool (aurora/conn-pool)}
                 :app-id (:id app)
                 :attrs (attr-model/get-by-app-id (:id app))}]
        (testing "limit"
          (is-pretty-eq? (query-pretty ctx r {:users {:$ {:limit 2
                                                          :order {:handle :desc}}}})
                         '({:topics #{[:eav _ #{:users/id} _]
                                      --
                                      [:ea #{"eid-stepan-parunashvili"} #{:users/bookshelves
                                                                          :users/createdAt
                                                                          :users/email
                                                                          :users/id
                                                                          :users/fullName
                                                                          :users/handle} _]
                                      [:ea #{"eid-nicole"} #{:users/bookshelves
                                                             :users/createdAt
                                                             :users/email
                                                             :users/id
                                                             :users/fullName
                                                             :users/handle} _]
                                      [:ave #{"eid-nicole" "eid-stepan-parunashvili"} #{:users/handle} _]}
                            :triples #{("eid-nicole" :users/fullName "Nicole")
                                       ("eid-nicole" :users/id "eid-nicole")
                                       ("eid-nicole" :users/handle "nicolegf")
                                       ("eid-nicole" :users/email "nicole@instantdb.com")
                                       ("eid-nicole" :users/createdAt "2021-02-05 22:35:23.754264")
                                       --
                                       ("eid-stepan-parunashvili"
                                        :users/createdAt
                                        "2021-01-07 18:50:43.447955")
                                       ("eid-stepan-parunashvili" :users/email "stopa@instantdb.com")
                                       ("eid-stepan-parunashvili" :users/fullName "Stepan Parunashvili")
                                       ("eid-stepan-parunashvili" :users/id "eid-stepan-parunashvili")
                                       ("eid-stepan-parunashvili" :users/handle "stopa")}})))

        (testing "limit with where"
          (is-pretty-eq? (query-pretty ctx r {:users {:$ {:where {:handle {:in ["joe" "stopa" "alex"]}}
                                                          :limit 2
                                                          :order {:handle :desc}}}})
                         '({:topics #{[:ea
                                       #{"eid-joe-averbukh"}
                                       #{:users/bookshelves
                                         :users/createdAt
                                         :users/email
                                         :users/id
                                         :users/fullName
                                         :users/handle}
                                       _]
                                      [:ea
                                       #{"eid-stepan-parunashvili"}
                                       #{:users/bookshelves
                                         :users/createdAt
                                         :users/email
                                         :users/id
                                         :users/fullName
                                         :users/handle}
                                       _]
                                      [:ave
                                       #{"eid-joe-averbukh" "eid-stepan-parunashvili"}
                                       #{:users/handle}
                                       _]
                                      --
                                      [:ave _ #{:users/handle} #{"alex" "stopa" "joe"}]}
                            :triples #{("eid-stepan-parunashvili" :users/email "stopa@instantdb.com")
                                       ("eid-joe-averbukh" :users/fullName "Joe Averbukh")
                                       ("eid-joe-averbukh" :users/handle "joe")
                                       ("eid-stepan-parunashvili"
                                        :users/createdAt
                                        "2021-01-07 18:50:43.447955")
                                       --
                                       ("eid-stepan-parunashvili" :users/fullName "Stepan Parunashvili")
                                       ("eid-stepan-parunashvili" :users/id "eid-stepan-parunashvili")
                                       ("eid-joe-averbukh" :users/id "eid-joe-averbukh")
                                       ("eid-stepan-parunashvili" :users/handle "stopa")
                                       ("eid-joe-averbukh" :users/email "joe@instantdb.com")
                                       ("eid-joe-averbukh" :users/createdAt "2021-01-07 18:51:23.742637")}})))

        (testing "offset"
          (is-pretty-eq? (query-pretty ctx r {:users {:$ {:offset 2
                                                          :order {:handle :desc}}}})
                         '({:topics #{[:ea
                                       #{"eid-joe-averbukh"}
                                       #{:users/bookshelves
                                         :users/createdAt
                                         :users/email
                                         :users/id
                                         :users/fullName
                                         :users/handle}
                                       _]
                                      [:eav _ #{:users/id} _]
                                      [:ave #{"eid-joe-averbukh" "eid-alex"} #{:users/handle} _]
                                      --
                                      [:ea
                                       #{"eid-alex"}
                                       #{:users/bookshelves
                                         :users/createdAt
                                         :users/email
                                         :users/id
                                         :users/fullName
                                         :users/handle}
                                       _]}
                            :triples #{("eid-alex" :users/email "alex@instantdb.com")
                                       ("eid-alex" :users/id "eid-alex")
                                       ("eid-alex" :users/createdAt "2021-01-09 18:53:07.993689")
                                       ("eid-alex" :users/fullName "Alex")
                                       ("eid-alex" :users/handle "alex")
                                       --
                                       ("eid-joe-averbukh" :users/fullName "Joe Averbukh")
                                       ("eid-joe-averbukh" :users/handle "joe")
                                       ("eid-joe-averbukh" :users/id "eid-joe-averbukh")
                                       ("eid-joe-averbukh" :users/email "joe@instantdb.com")
                                       ("eid-joe-averbukh" :users/createdAt "2021-01-07 18:51:23.742637")}})))

        (testing "cursors"
          (let [{:keys [start-cursor end-cursor]}
                (-> (iq/query ctx {:users {:$ {:limit 1
                                               :order {:handle :desc}}}})
                    first
                    :data
                    :datalog-result
                    :page-info)]

            (testing "after"
              (is-pretty-eq? (query-pretty ctx r {:users {:$ {:limit 1
                                                              :after end-cursor
                                                              :order {:handle :desc}}}})
                             '({:topics #{[:eav _ #{:users/id} _]
                                          --
                                          [:ea #{"eid-nicole"} #{:users/bookshelves
                                                                 :users/createdAt
                                                                 :users/email
                                                                 :users/id
                                                                 :users/fullName
                                                                 :users/handle} _]
                                          [:ave #{"eid-nicole"} #{:users/handle} _]}
                                :triples #{("eid-nicole" :users/id "eid-nicole")
                                           --
                                           ("eid-nicole" :users/handle "nicolegf")
                                           ("eid-nicole" :users/fullName "Nicole")
                                           ("eid-nicole" :users/email "nicole@instantdb.com")
                                           ("eid-nicole" :users/createdAt "2021-02-05 22:35:23.754264")}})))

            (testing "before"
              (is-pretty-eq? (query-pretty ctx r {:users {:$ {:limit 1
                                                              :before start-cursor
                                                              :order {:handle :desc}}}})
                             '({:topics #{[:eav _ #{:users/id} _] [:ave _ #{:users/handle} _]}
                                :triples #{}}))

              (is-pretty-eq? (query-pretty ctx r {:users {:$ {:limit 1
                                                              :before start-cursor
                                                              :order {:handle "asc"}}}})
                             '({:topics #{[:eav _ #{:users/id} _]
                                          [:ea #{"eid-alex"} #{:users/bookshelves
                                                               :users/createdAt
                                                               :users/email
                                                               :users/id
                                                               :users/fullName
                                                               :users/handle} _]
                                          --
                                          [:ave #{"eid-alex"} #{:users/handle} _]}
                                :triples #{("eid-alex" :users/email "alex@instantdb.com")
                                           ("eid-alex" :users/id "eid-alex")
                                           ("eid-alex" :users/createdAt "2021-01-09 18:53:07.993689")
                                           --
                                           ("eid-alex" :users/fullName "Alex")
                                           ("eid-alex" :users/handle "alex")}})))

            (testing "last"
              (is-pretty-eq? (query-pretty ctx r {:users {:$ {:limit 1
                                                              :before start-cursor
                                                              :order {:handle :desc}}}})
                             '({:topics #{[:eav _ #{:users/id} _] [:ave _ #{:users/handle} _]}
                                :triples #{}}))

              (is-pretty-eq? (query-pretty ctx r {:users {:$ {:last 1
                                                              :before start-cursor
                                                              :order {:handle "asc"}}}})
                             '({:topics #{[:eav _ #{:users/id} _]
                                          --
                                          [:ea #{"eid-nicole"} #{:users/bookshelves
                                                                 :users/createdAt
                                                                 :users/email
                                                                 :users/id
                                                                 :users/fullName
                                                                 :users/handle} _]
                                          [:ave #{"eid-nicole"} #{:users/handle} _]}
                                :triples #{("eid-nicole" :users/id "eid-nicole")
                                           --
                                           ("eid-nicole" :users/handle "nicolegf")
                                           ("eid-nicole" :users/fullName "Nicole")
                                           ("eid-nicole" :users/email "nicole@instantdb.com")
                                           ("eid-nicole" :users/createdAt "2021-02-05 22:35:23.754264")}})))

            (let [nicole-cursor (-> (iq/query ctx {:users {:$ {:limit 1
                                                               :where {:handle "nicolegf"}
                                                               :order {:handle "desc"}}}})
                                    first
                                    :data
                                    :datalog-result
                                    :page-info
                                    :start-cursor)
                  get-handles (fn [pagination-params]
                                (as-> (instaql-nodes->object-tree
                                       ctx
                                       (iq/query ctx {:users {:$ pagination-params}})) %
                                  (get % "users")
                                  (map #(get % "handle") %)
                                  (set %)))
                  get-page-info (fn [pagination-params]
                                  (-> (iq/query ctx {:users {:$ pagination-params}})
                                      collect-instaql-results-for-client
                                      first
                                      :data
                                      :page-info
                                      (get "users")
                                      (select-keys [:has-next-page?
                                                    :has-previous-page?])))]
              ;; True order (in order of handle) is alex, joe, nicolegf, stopa
              (is (= #{"stopa" "nicolegf" "joe" "alex"}
                     (get-handles {:order {:handle "asc"}})))

              (is (= #{"alex" "joe"}
                     (get-handles {:limit 2
                                   :order {:handle "asc"}})))

              (is (= #{"joe" "nicolegf"}
                     (get-handles {:limit 2
                                   :offset 1
                                   :order {:handle "asc"}})))

              (is (= #{"joe"}
                     (get-handles {:last 1
                                   :before nicole-cursor
                                   :order {:handle "asc"}})))

              (is (= #{"alex" "joe"}
                     (get-handles {:last 2
                                   :before nicole-cursor
                                   :order {:handle "asc"}})))

              (is (= #{"stopa"}
                     (get-handles {:first 1
                                   :after nicole-cursor
                                   :order {:handle "asc"}})))

              (is (= #{"joe"}
                     (get-handles {:first 1
                                   :after nicole-cursor
                                   :order {:handle "desc"}})))

              (testing "has-next-page? and has-previous-page?"
                (is (= {:has-next-page? false
                        :has-previous-page? false}
                       (get-page-info {:order {:handle "asc"}})))

                (is (= {:has-next-page? true
                        :has-previous-page? false}
                       (get-page-info {:limit 2
                                       :order {:handle "asc"}})))

                (is (= {:has-next-page? true
                        :has-previous-page? true}
                       (get-page-info {:limit 2
                                       :offset 1
                                       :order {:handle "asc"}})))

                (is (= {:has-next-page? true
                        :has-previous-page? true}
                       (get-page-info {:last 1
                                       :before nicole-cursor
                                       :order {:handle "asc"}})))

                (is (= {:has-next-page? true
                        :has-previous-page? false}
                       (get-page-info {:last 2
                                       :before nicole-cursor
                                       :order {:handle "asc"}})))

                (is (= {:has-next-page? false
                        :has-previous-page? true}
                       (get-page-info {:first 1
                                       :after nicole-cursor
                                       :order {:handle "asc"}})))

                (is (= {:has-next-page? true
                        :has-previous-page? true}
                       (get-page-info {:first 1
                                       :after nicole-cursor
                                       :order {:handle "desc"}})))))))))))

(deftest pagination-with-null-values
  (with-zeneca-checked-data-app
    (fn [app r]
      (let [uid (UUID. 0 0)
            uid-2 (UUID. 0 1)
            _ (tx/transact! (aurora/conn-pool)
                            (attr-model/get-by-app-id (:id app))
                            (:id app)
                            [[:add-triple uid (resolvers/->uuid r :users/id) (str uid)]
                             [:add-triple uid (resolvers/->uuid r :users/handle) "first"]])
            ctx {:db {:conn-pool (aurora/conn-pool)}
                 :app-id (:id app)
                 :attrs (attr-model/get-by-app-id (:id app))}
            get-handles (fn [pagination-params]
                          (as-> (instaql-nodes->object-tree
                                 ctx
                                 (iq/query ctx {:users {:$ pagination-params}})) %
                            (get % "users")
                            (map #(get % "handle") %)))]
        (is (= ["first" "alex" "joe" "nicolegf" "stopa"]
               (get-handles {:order {:email "asc"}})))

        (is (= ["stopa" "nicolegf" "joe" "alex" "first"]
               (get-handles {:order {:email "desc"}})))

        (testing "null as a value"
          (tx/transact! (aurora/conn-pool)
                        (attr-model/get-by-app-id (:id app))
                        (:id app)
                        [[:add-triple uid-2 (resolvers/->uuid r :users/id) (str uid-2)]
                         [:add-triple uid-2 (resolvers/->uuid r :users/handle) "second"]
                         [:add-triple uid-2 (resolvers/->uuid r :users/email) nil]])

          (is (= ["first" "second" "alex" "joe" "nicolegf" "stopa"]
                 (get-handles {:order {:email "asc"}})))

          (is (= ["stopa" "nicolegf" "joe" "alex" "second" "first"]
                 (get-handles {:order {:email "desc"}}))))

        (testing "before"
          (let [handles ["first" "second" "alex" "joe" "nicolegf" "stopa"]]
            (doseq [order [:asc :desc]
                    :let [handles (if (= order :desc)
                                    (reverse handles)
                                    handles)]]
              (testing (format "order %s" order)

                (loop [i 0
                       next-after nil]
                  (when (> i (count handles))
                    (throw (Exception. "runaway test")))
                  (let [qr (iq/query ctx {:users {:$ {:limit 1
                                                      :order {:email order}
                                                      :after next-after}}})
                        handle (-> (instaql-nodes->object-tree ctx qr)
                                   (get "users")
                                   first
                                   (get "handle"))
                        {:keys [end-cursor]} (-> qr
                                                 first
                                                 :data
                                                 :datalog-result
                                                 :page-info)]
                    (testing (format "loop %d gives us handle=`%s`" i (nth handles i))
                      (println (format "loop %d gives us %s" i (nth handles i)))
                      (is (= handle (nth handles i))))
                    (when (not= i (dec (count handles)))
                      (recur (inc i)
                             end-cursor)))))))
          (let [{:keys [end-cursor]} (-> (iq/query ctx
                                                   {:users {:$ {:limit 1 :order {:email :asc}}}})
                                         first
                                         :data
                                         :datalog-result
                                         :page-info)]

            (is (= ["second"]
                   (get-handles {:order {:email :asc}
                                 :limit 1
                                 :after end-cursor})))))))))

(deftest obj-tree-order
  (with-empty-app
    (fn [{app-id :id :as _app}]
      (let [get-handles-ordered (fn [pagination-params]
                                  (as-> (instaql-nodes->object-tree
                                         {:db {:conn-pool (aurora/conn-pool)}
                                          :app-id app-id
                                          :attrs (attr-model/get-by-app-id app-id)}
                                         (iq/query
                                          {:db {:conn-pool (aurora/conn-pool)}
                                           :app-id app-id
                                           :attrs (attr-model/get-by-app-id app-id)}
                                          {:users {:$ pagination-params}})) %
                                    (get % "users")
                                    (map #(get % "handle") %)
                                    (vec %)))
            uid-attr-id (random-uuid)
            handle-attr-id (random-uuid)
            joe-eid (random-uuid)
            stopa-eid (random-uuid)
            daniel-eid (random-uuid)
            _ (tx/transact! (aurora/conn-pool)
                            (attr-model/get-by-app-id app-id)
                            app-id
                            [[:add-attr {:id uid-attr-id
                                         :forward-identity [(random-uuid) "users" "id"]
                                         :unique? true
                                         :index? true
                                         :value-type :blob
                                         :cardinality :one}]
                             [:add-attr {:id handle-attr-id
                                         :forward-identity [(random-uuid) "users" "handle"]
                                         :unique? true
                                         :index? true
                                         :value-type :blob
                                         :cardinality :one
                                         :checked-data-type :string}]])

            _ (tx/transact! (aurora/conn-pool)
                            (attr-model/get-by-app-id app-id)
                            app-id
                            [[:add-triple joe-eid uid-attr-id (str joe-eid)]
                             [:add-triple joe-eid handle-attr-id "joe"]])

            _ (tx/transact! (aurora/conn-pool)
                            (attr-model/get-by-app-id app-id)
                            app-id
                            [[:add-triple stopa-eid uid-attr-id (str stopa-eid)]
                             [:add-triple stopa-eid handle-attr-id "stopa"]])

            _ (tx/transact! (aurora/conn-pool)
                            (attr-model/get-by-app-id app-id)
                            app-id
                            [[:add-triple daniel-eid uid-attr-id (str daniel-eid)]
                             [:add-triple daniel-eid handle-attr-id "daniel"]])]

        (testing "default is serverCreatedAt asc"
          (is (= ["joe" "stopa" "daniel"]
                 (get-handles-ordered {})))
          (is (= ["joe" "stopa" "daniel"]
                 (get-handles-ordered {:order {:serverCreatedAt "asc"}}))))
        (testing "reverse works"
          (is (= ["daniel" "stopa" "joe"]
                 (get-handles-ordered {:order {:serverCreatedAt "desc"}}))))

        (testing "checked and indexed fields work"
          (is (= ["daniel" "joe" "stopa"]
                 (get-handles-ordered {:order {:handle "asc"}})))
          (is (= ["stopa" "joe" "daniel"]
                 (get-handles-ordered {:order {:handle "desc"}}))))))))

(deftest flat-where-byop
  (testing "plain scan"
    (with-zeneca-byop
      (fn [ctx _app r]
        (is-pretty-eq?
         (->> {:users {}}
              (iq/query-byop ctx)
              (resolvers/walk-friendly r)
              (map ->pretty-node))

         '({:topics
            ([:ea _ #{:users/id} _]
             [:ea #{"eid-stepan-parunashvili"} _ _]
             [:ea #{"eid-nicole"} _ _]
             [:ea #{"eid-joe-averbukh"} _ _]
             [:ea #{"eid-alex"} _ _]),
            :triples
            (["eid-alex" :users/id "eid-alex"]
             ["eid-joe-averbukh" :users/id "eid-joe-averbukh"]
             ["eid-nicole" :users/id "eid-nicole"]
             ["eid-stepan-parunashvili" :users/id "eid-stepan-parunashvili"]
             ["eid-stepan-parunashvili"
              :users/createdAt
              "2021-01-07 18:50:43.447955"]
             ["eid-stepan-parunashvili" :users/email "stopa@instantdb.com"]
             ["eid-stepan-parunashvili" :users/fullName "Stepan Parunashvili"]
             ["eid-stepan-parunashvili" :users/handle "stopa"]
             ["eid-stepan-parunashvili" :users/id "eid-stepan-parunashvili"]
             ["eid-nicole"
              :users/createdAt
              "2021-02-05 22:35:23.754264"]
             ["eid-nicole" :users/email "nicole@instantdb.com"]
             ["eid-nicole"
              :users/fullName
              "Nicole"]
             ["eid-nicole" :users/handle "nicolegf"]
             ["eid-nicole" :users/id "eid-nicole"]
             ["eid-joe-averbukh" :users/createdAt "2021-01-07 18:51:23.742637"]
             ["eid-joe-averbukh" :users/email "joe@instantdb.com"]
             ["eid-joe-averbukh" :users/fullName "Joe Averbukh"]
             ["eid-joe-averbukh" :users/handle "joe"]
             ["eid-joe-averbukh" :users/id "eid-joe-averbukh"]
             ["eid-alex" :users/createdAt "2021-01-09 18:53:07.993689"]
             ["eid-alex" :users/email "alex@instantdb.com"]
             ["eid-alex" :users/fullName "Alex"]
             ["eid-alex" :users/handle "alex"]
             ["eid-alex" :users/id "eid-alex"])}))))))

(deftest flat-where
  (testing "plain scan"
    (is-pretty-eq?
     (query-pretty
      {:users {}})
     '({:topics
        ([:eav _ #{:users/id} _]
         --
         [:ea #{"eid-stepan-parunashvili"} #{:users/bookshelves
                                             :users/createdAt
                                             :users/email
                                             :users/id
                                             :users/fullName
                                             :users/handle} _]
         --
         [:ea #{"eid-nicole"} #{:users/bookshelves
                                :users/createdAt
                                :users/email
                                :users/id
                                :users/fullName
                                :users/handle} _]
         --
         [:ea #{"eid-joe-averbukh"} #{:users/bookshelves
                                      :users/createdAt
                                      :users/email
                                      :users/id
                                      :users/fullName
                                      :users/handle} _]
         --
         [:ea #{"eid-alex"} #{:users/bookshelves
                              :users/createdAt
                              :users/email
                              :users/id
                              :users/fullName
                              :users/handle} _]),
        :triples
        (["eid-alex" :users/id "eid-alex"]
         ["eid-joe-averbukh" :users/id "eid-joe-averbukh"]
         ["eid-nicole" :users/id "eid-nicole"]
         ["eid-stepan-parunashvili" :users/id "eid-stepan-parunashvili"]
         --
         ["eid-stepan-parunashvili"
          :users/createdAt
          "2021-01-07 18:50:43.447955"]
         ["eid-stepan-parunashvili" :users/email "stopa@instantdb.com"]
         ["eid-stepan-parunashvili" :users/fullName "Stepan Parunashvili"]
         ["eid-stepan-parunashvili" :users/handle "stopa"]
         ["eid-stepan-parunashvili" :users/id "eid-stepan-parunashvili"]
         --
         ["eid-nicole"
          :users/createdAt
          "2021-02-05 22:35:23.754264"]
         ["eid-nicole" :users/email "nicole@instantdb.com"]
         ["eid-nicole"
          :users/fullName
          "Nicole"]
         ["eid-nicole" :users/handle "nicolegf"]
         ["eid-nicole" :users/id "eid-nicole"]
         --
         ["eid-joe-averbukh" :users/createdAt "2021-01-07 18:51:23.742637"]
         ["eid-joe-averbukh" :users/email "joe@instantdb.com"]
         ["eid-joe-averbukh" :users/fullName "Joe Averbukh"]
         ["eid-joe-averbukh" :users/handle "joe"]
         ["eid-joe-averbukh" :users/id "eid-joe-averbukh"]
         --
         ["eid-alex" :users/createdAt "2021-01-09 18:53:07.993689"]
         ["eid-alex" :users/email "alex@instantdb.com"]
         ["eid-alex" :users/fullName "Alex"]
         ["eid-alex" :users/handle "alex"]
         ["eid-alex" :users/id "eid-alex"])})))
  (testing "by an attr"
    (is-pretty-eq?
     (query-pretty
      {:users {:$ {:where {:handle "alex"}}}})
     '({:topics
        ([:av _ #{:users/handle} #{"alex"}]
         --
         [:ea #{"eid-alex"} #{:users/bookshelves
                              :users/createdAt
                              :users/email
                              :users/id
                              :users/fullName
                              :users/handle} _]),
        :triples
        (["eid-alex" :users/handle "alex"]
         --
         ["eid-alex" :users/createdAt "2021-01-09 18:53:07.993689"]
         ["eid-alex" :users/email "alex@instantdb.com"]
         ["eid-alex" :users/fullName "Alex"]
         ["eid-alex" :users/handle "alex"]
         ["eid-alex" :users/id "eid-alex"])})))
  (testing "by id"
    (is-pretty-eq?
     (query-pretty
      {:users
       {:$ {:where {:id (resolvers/->uuid @r "eid-alex")}}}})
     '({:topics
        ([:av _ #{:users/id} #{"eid-alex"}]
         --
         [:ea #{"eid-alex"} #{:users/bookshelves
                              :users/createdAt
                              :users/email
                              :users/id
                              :users/fullName
                              :users/handle} _]),
        :triples
        (["eid-alex" :users/id "eid-alex"]
         --
         ["eid-alex" :users/createdAt "2021-01-09 18:53:07.993689"]
         ["eid-alex" :users/email "alex@instantdb.com"]
         ["eid-alex" :users/fullName "Alex"]
         ["eid-alex" :users/handle "alex"]
         ["eid-alex" :users/id "eid-alex"])}))))

(deftest deep-where
  (testing "reference attrs"
    (is-pretty-eq?
     (query-pretty
      {:users {:$ {:where {:bookshelves.books.title "Musashi"}}}})
     '({:topics
        ([:ea _ #{:books/title} #{"Musashi"}]
         [:vae _ #{:bookshelves/books} #{"eid-musashi"}]
         [:vae _ #{:users/bookshelves} #{"eid-the-way-of-the-gentleman"}]
         --
         [:ea #{"eid-stepan-parunashvili"} #{:users/bookshelves
                                             :users/createdAt
                                             :users/email
                                             :users/id
                                             :users/fullName
                                             :users/handle} _]),
        :triples
        (["eid-musashi" :books/title "Musashi"]
         ["eid-stepan-parunashvili"
          :users/bookshelves
          "eid-the-way-of-the-gentleman"]
         ["eid-the-way-of-the-gentleman" :bookshelves/books "eid-musashi"]
         --
         ["eid-stepan-parunashvili"
          :users/createdAt
          "2021-01-07 18:50:43.447955"]
         ["eid-stepan-parunashvili" :users/email "stopa@instantdb.com"]
         ["eid-stepan-parunashvili" :users/fullName "Stepan Parunashvili"]
         ["eid-stepan-parunashvili" :users/handle "stopa"]
         ["eid-stepan-parunashvili" :users/id "eid-stepan-parunashvili"])})))
  (testing "reference ids"
    (let [bookshelves-id (str (resolvers/->uuid @r "eid-musashi"))]
      (is-pretty-eq?
       (query-pretty
        {:users
         {:$ {:where {:bookshelves.books.id bookshelves-id}}}})
       '({:topics
          ([:av _ #{:books/id} #{"eid-musashi"}]
           [:vae _ #{:bookshelves/books} #{"eid-musashi"}]
           [:vae _ #{:users/bookshelves} #{"eid-the-way-of-the-gentleman"}]
           --
           [:ea #{"eid-stepan-parunashvili"} #{:users/bookshelves
                                               :users/createdAt
                                               :users/email
                                               :users/id
                                               :users/fullName
                                               :users/handle} _]),
          :triples
          (["eid-musashi" :books/id "eid-musashi"]
           ["eid-stepan-parunashvili"
            :users/bookshelves
            "eid-the-way-of-the-gentleman"]
           ["eid-the-way-of-the-gentleman" :bookshelves/books "eid-musashi"]
           --
           ["eid-stepan-parunashvili"
            :users/createdAt
            "2021-01-07 18:50:43.447955"]
           ["eid-stepan-parunashvili" :users/email "stopa@instantdb.com"]
           ["eid-stepan-parunashvili" :users/fullName "Stepan Parunashvili"]
           ["eid-stepan-parunashvili" :users/handle "stopa"]
           ["eid-stepan-parunashvili" :users/id "eid-stepan-parunashvili"])}))
      (testing "works with ref id"
        (is-pretty-eq?
         (query-pretty
          {:users
           {:$ {:where {:bookshelves.books bookshelves-id}}}})
         '({:topics
            ([:vae _ #{:bookshelves/books} #{"eid-musashi"}]
             [:vae _ #{:users/bookshelves} #{"eid-the-way-of-the-gentleman"}]
             --
             [:ea #{"eid-stepan-parunashvili"} #{:users/bookshelves
                                                 :users/createdAt
                                                 :users/email
                                                 :users/id
                                                 :users/fullName
                                                 :users/handle} _]),
            :triples
            (["eid-stepan-parunashvili"
              :users/bookshelves
              "eid-the-way-of-the-gentleman"]
             ["eid-the-way-of-the-gentleman" :bookshelves/books "eid-musashi"]
             --
             ["eid-stepan-parunashvili"
              :users/createdAt
              "2021-01-07 18:50:43.447955"]
             ["eid-stepan-parunashvili" :users/email "stopa@instantdb.com"]
             ["eid-stepan-parunashvili" :users/fullName "Stepan Parunashvili"]
             ["eid-stepan-parunashvili" :users/handle "stopa"]
             ["eid-stepan-parunashvili" :users/id "eid-stepan-parunashvili"])}))))))

(deftest multiple-where
  (testing "no matches"
    (is-pretty-eq?
     (query-pretty
      {:users {:$ {:where {:bookshelves.books.title "Musashi"
                           :email "random@example.com"}}}})
     '({:topics
        ([:vae _ #{:users/bookshelves} _]
         [:ea _ #{:books/title} #{"Musashi"}]
         [:vae _ #{:bookshelves/books} _]
         [:av _ #{:users/email} #{"random@example.com"}]),
        :triples ()})))

  (testing "Single match"
    (is-pretty-eq?
     (query-pretty
      {:users {:$ {:where {:bookshelves.books.title "Musashi"
                           :email "stopa@instantdb.com"}}}})
     '({:topics
        ([:ea _ #{:books/title} #{"Musashi"}]
         [:vae _ #{:bookshelves/books} #{"eid-musashi"}]
         [:vae _ #{:users/bookshelves} #{"eid-the-way-of-the-gentleman"}]
         [:av #{"eid-stepan-parunashvili"} #{:users/email} #{"stopa@instantdb.com"}]
         --
         [:ea #{"eid-stepan-parunashvili"} #{:users/bookshelves
                                             :users/createdAt
                                             :users/email
                                             :users/id
                                             :users/fullName
                                             :users/handle} _]),
        :triples
        (("eid-the-way-of-the-gentleman" :bookshelves/books "eid-musashi")
         ("eid-musashi" :books/title "Musashi")
         ("eid-stepan-parunashvili" :users/bookshelves "eid-the-way-of-the-gentleman")
         ("eid-stepan-parunashvili" :users/email "stopa@instantdb.com")
         --
         ("eid-stepan-parunashvili" :users/createdAt "2021-01-07 18:50:43.447955")
         ("eid-stepan-parunashvili" :users/fullName "Stepan Parunashvili")
         ("eid-stepan-parunashvili" :users/handle "stopa")
         ("eid-stepan-parunashvili" :users/email "stopa@instantdb.com")
         ("eid-stepan-parunashvili" :users/id "eid-stepan-parunashvili"))})))

  (testing "child where clause"
    (is-pretty-eq?
     (query-pretty
      {:users
       {:$ {:where {:handle "alex"}},
        :bookshelves {:$ {:where {:name "Nonfiction"
                                  :order 1}}}}})
     '({:topics
        ([:av _ #{:users/handle} #{"alex"}]
         --
         [:ea #{"eid-alex"} #{:users/bookshelves
                              :users/createdAt
                              :users/email
                              :users/id
                              :users/fullName
                              :users/handle} _]
         --
         [:eav #{"eid-alex"} #{:users/bookshelves} _]
         [:ea _ #{:bookshelves/name} #{"Nonfiction"}]
         [:ea #{"eid-nonfiction"} #{:bookshelves/order} #{1}]
         --
         [:ea #{"eid-nonfiction"} #{:bookshelves/desc
                                    :bookshelves/name
                                    :bookshelves/order
                                    :bookshelves/id
                                    :bookshelves/books} _]),
        :triples
        (["eid-alex" :users/handle "alex"]
         --
         ["eid-alex" :users/createdAt "2021-01-09 18:53:07.993689"]
         ["eid-alex" :users/email "alex@instantdb.com"]
         ["eid-alex" :users/fullName "Alex"]
         ["eid-alex" :users/handle "alex"]
         ["eid-alex" :users/id "eid-alex"]
         --
         ["eid-alex" :users/bookshelves "eid-nonfiction"]
         ["eid-nonfiction" :bookshelves/name "Nonfiction"]
         --
         ["eid-nonfiction" :bookshelves/desc ""]
         ["eid-nonfiction" :bookshelves/id "eid-nonfiction"]
         ["eid-nonfiction" :bookshelves/name "Nonfiction"]
         ["eid-nonfiction" :bookshelves/order 1])}))))

(deftest where-in
  (testing "with no matches"
    (is-pretty-eq?
     (query-pretty
      {:users {:$ {:where {:handle {:in ["nobody"]}}}}})
     '({:topics
        ([:av _ #{:users/handle} #{"nobody"}]),
        :triples ()})))

  (testing "with matches"
    (is-pretty-eq?
     (query-pretty
      {:users {:$ {:where {:handle {:in ["joe", "stopa"]}}}}})
     '({:topics ([:av _ #{:users/handle} #{"stopa" "joe"}]
                 --
                 [:ea #{"eid-stepan-parunashvili"} #{:users/bookshelves
                                                     :users/createdAt
                                                     :users/email
                                                     :users/id
                                                     :users/fullName
                                                     :users/handle} _]
                 --
                 [:ea #{"eid-joe-averbukh"} #{:users/bookshelves
                                              :users/createdAt
                                              :users/email
                                              :users/id
                                              :users/fullName
                                              :users/handle} _]),
        :triples (("eid-joe-averbukh" :users/handle "joe")
                  ("eid-stepan-parunashvili" :users/handle "stopa")
                  --
                  ("eid-stepan-parunashvili" :users/createdAt "2021-01-07 18:50:43.447955")
                  ("eid-stepan-parunashvili" :users/fullName "Stepan Parunashvili")
                  ("eid-stepan-parunashvili" :users/handle "stopa")
                  ("eid-stepan-parunashvili" :users/email "stopa@instantdb.com")
                  ("eid-stepan-parunashvili" :users/id "eid-stepan-parunashvili")
                  --
                  ("eid-joe-averbukh" :users/id "eid-joe-averbukh")
                  ("eid-joe-averbukh" :users/handle "joe")
                  ("eid-joe-averbukh" :users/fullName "Joe Averbukh")
                  ("eid-joe-averbukh" :users/email "joe@instantdb.com")
                  ("eid-joe-averbukh" :users/createdAt "2021-01-07 18:51:23.742637"))}))))

(deftest where-$like
  (with-zeneca-checked-data-app
    (fn [app r]
      (let [ctx {:db {:conn-pool (aurora/conn-pool)}
                 :app-id (:id app)
                 :attrs (attr-model/get-by-app-id (:id app))}]
        (testing "with no matches"
          (is-pretty-eq?
           (query-pretty ctx r
                         {:users {:$ {:where {:handle {:$like "%moop%"}}}}})
           '({:topics ([:ave _ #{:users/handle} {:$comparator {:op :$like, :value "%moop%", :data-type :string}}])
              :triples ()})))
        (testing "with equality"
          (is-pretty-eq?
           (query-pretty ctx r
                         {:users {:$ {:where {:handle {:$like "joe"}}}}})
           '({:topics
              ([:ave _ #{:users/handle} {:$comparator {:op :$like, :value "joe", :data-type :string}}]
               --
               [:ea
                #{"eid-joe-averbukh"}
                #{:users/bookshelves
                  :users/createdAt
                  :users/email
                  :users/id
                  :users/fullName
                  :users/handle}
                _]),
              :triples
              (("eid-joe-averbukh" :users/handle "joe")
               --
               ("eid-joe-averbukh" :users/id "eid-joe-averbukh")
               ("eid-joe-averbukh" :users/email "joe@instantdb.com")
               ("eid-joe-averbukh" :users/handle "joe")
               ("eid-joe-averbukh" :users/fullName "Joe Averbukh")
               ("eid-joe-averbukh" :users/createdAt "2021-01-07 18:51:23.742637"))})))
        (testing "like startsWith"
          (is-pretty-eq?
           (query-pretty ctx r
                         {:users {:$ {:where {:handle {:$like "al%"}}}}})
           '({:topics
              ([:ave _ #{:users/handle} {:$comparator {:op :$like, :value "al%", :data-type :string}}]
               --
               [:ea
                #{"eid-alex"}
                #{:users/bookshelves
                  :users/createdAt
                  :users/email
                  :users/id
                  :users/fullName
                  :users/handle}
                _]),
              :triples
              (("eid-alex" :users/handle "alex")
               --
               ("eid-alex" :users/id "eid-alex")
               ("eid-alex" :users/fullName "Alex")
               ("eid-alex" :users/email "alex@instantdb.com")
               ("eid-alex" :users/handle "alex")
               ("eid-alex" :users/createdAt "2021-01-09 18:53:07.993689")),
              :aggregate (nil nil)})))
        (testing "like endsWith deep"
          (is-pretty-eq?
           (query-pretty ctx r
                         {:users {:$ {:where {:bookshelves.books.title {:$like "%Monte Cristo"}}}}})
           '({:topics
              ([:ave _ #{:books/title} {:$comparator
                                        {:op :$like, :value "%Monte Cristo", :data-type :string}}]
               [:vae _ #{:bookshelves/books} #{"eid-the-count-of-monte-cristo"}]
               [:vae
                _
                #{:users/bookshelves}
                #{"eid-the-way-of-the-gentleman" "eid-fiction"}]
               --
               [:ea
                #{"eid-stepan-parunashvili"}
                #{:users/bookshelves
                  :users/createdAt
                  :users/email
                  :users/id
                  :users/fullName
                  :users/handle}
                _]
               --
               [:ea
                #{"eid-nicole"}
                #{:users/bookshelves
                  :users/createdAt
                  :users/email
                  :users/id
                  :users/fullName
                  :users/handle}
                _]),
              :triples
              (("eid-the-count-of-monte-cristo"
                :books/title
                "The Count of Monte Cristo")
               ("eid-the-count-of-monte-cristo"
                :books/title
                "The Count of Monte Cristo")
               ("eid-nicole" :users/bookshelves "eid-fiction")
               ("eid-fiction" :bookshelves/books "eid-the-count-of-monte-cristo")
               ("eid-the-way-of-the-gentleman"
                :bookshelves/books
                "eid-the-count-of-monte-cristo")
               ("eid-stepan-parunashvili"
                :users/bookshelves
                "eid-the-way-of-the-gentleman")
               --
               ("eid-stepan-parunashvili" :users/email "stopa@instantdb.com")
               ("eid-stepan-parunashvili"
                :users/createdAt
                "2021-01-07 18:50:43.447955")
               ("eid-stepan-parunashvili" :users/fullName "Stepan Parunashvili")
               ("eid-stepan-parunashvili" :users/handle "stopa")
               ("eid-stepan-parunashvili" :users/id "eid-stepan-parunashvili")
               --
               ("eid-nicole" :users/createdAt "2021-02-05 22:35:23.754264")
               ("eid-nicole" :users/email "nicole@instantdb.com")
               ("eid-nicole" :users/handle "nicolegf")
               ("eid-nicole" :users/id "eid-nicole")
               ("eid-nicole" :users/fullName "Nicole")),
              :aggregate (nil nil nil)})))))))

(deftest where-$ilike
  (with-zeneca-checked-data-app
    (fn [app r]
      (let [ctx {:db {:conn-pool (aurora/conn-pool)}
                 :app-id (:id app)
                 :attrs (attr-model/get-by-app-id (:id app))}]
        (testing "with no matches"
          (is-pretty-eq?
           (query-pretty ctx r
                         {:users {:$ {:where {:handle {:$ilike "%moop%"}}}}})
           '({:topics ([:ave _ #{:users/handle} {:$comparator {:op :$ilike, :value "%moop%", :data-type :string}}])
              :triples ()})))
        (testing "with equality"
          (is-pretty-eq?
           (query-pretty ctx r
                         {:users {:$ {:where {:handle {:$ilike "joe"}}}}})
           '({:topics
              ([:ave _ #{:users/handle} {:$comparator {:op :$ilike, :value "joe", :data-type :string}}]
               --
               [:ea
                #{"eid-joe-averbukh"}
                #{:users/bookshelves
                  :users/createdAt
                  :users/email
                  :users/id
                  :users/fullName
                  :users/handle}
                _]),
              :triples
              (("eid-joe-averbukh" :users/handle "joe")
               --
               ("eid-joe-averbukh" :users/id "eid-joe-averbukh")
               ("eid-joe-averbukh" :users/email "joe@instantdb.com")
               ("eid-joe-averbukh" :users/handle "joe")
               ("eid-joe-averbukh" :users/fullName "Joe Averbukh")
               ("eid-joe-averbukh" :users/createdAt "2021-01-07 18:51:23.742637"))})))))))

(deftest where-$not
  (is-pretty-eq?
   (query-pretty
    {:users {:$ {:where {:and [{:handle {:$not "alex"}}
                               {:handle {:$not "nicolegf"}}]}}}})
   '({:topics ([:ea #{"eid-joe-averbukh" "eid-stepan-parunashvili"} #{:users/id} _]
               [:ea _ #{:users/handle} _]
               [:av
                #{"eid-joe-averbukh" "eid-stepan-parunashvili"}
                #{:users/handle}
                {:$not "nicolegf"}]
               [:av _ #{:users/handle} {:$not "alex"}]
               [:ea _ #{:users/id} _]
               --
               [:ea #{"eid-stepan-parunashvili"} #{:users/bookshelves
                                                   :users/createdAt
                                                   :users/email
                                                   :users/id
                                                   :users/fullName
                                                   :users/handle} _]
               --
               [:ea #{"eid-joe-averbukh"} #{:users/bookshelves
                                            :users/createdAt
                                            :users/email
                                            :users/id
                                            :users/fullName
                                            :users/handle} _]),
      :triples (("eid-joe-averbukh" :users/handle "joe")
                ("eid-stepan-parunashvili" :users/handle "stopa")
                --
                ("eid-stepan-parunashvili" :users/createdAt "2021-01-07 18:50:43.447955")
                ("eid-stepan-parunashvili" :users/fullName "Stepan Parunashvili")
                ("eid-stepan-parunashvili" :users/handle "stopa")
                ("eid-stepan-parunashvili" :users/email "stopa@instantdb.com")
                ("eid-stepan-parunashvili" :users/id "eid-stepan-parunashvili")
                --
                ("eid-joe-averbukh" :users/id "eid-joe-averbukh")
                ("eid-joe-averbukh" :users/handle "joe")
                ("eid-joe-averbukh" :users/fullName "Joe Averbukh")
                ("eid-joe-averbukh" :users/email "joe@instantdb.com")
                ("eid-joe-averbukh" :users/createdAt "2021-01-07 18:51:23.742637"))})))

(deftest where-$not-with-nils
  (with-empty-app
    (fn [app]
      (let [make-ctx (fn []
                       (let [attrs (attr-model/get-by-app-id (:id app))]
                         {:db {:conn-pool (aurora/conn-pool)}
                          :app-id (:id app)
                          :attrs attrs}))

            id-aid (random-uuid)
            title-aid (random-uuid)
            val-aid (random-uuid)

            id-1 (random-uuid)
            id-2 (random-uuid)
            id-null (random-uuid)
            id-undefined (random-uuid)
            _ (tx/transact! (aurora/conn-pool)
                            (attr-model/get-by-app-id (:id app))
                            (:id app)
                            [[:add-attr {:id id-aid
                                         :forward-identity [(random-uuid) "books" "id"]
                                         :unique? true
                                         :index? true
                                         :value-type :blob
                                         :cardinality :one}]
                             [:add-attr {:id title-aid
                                         :forward-identity [(random-uuid) "books" "title"]
                                         :unique? false
                                         :index? false
                                         :value-type :blob
                                         :cardinality :one}]
                             [:add-attr {:id val-aid
                                         :forward-identity [(random-uuid) "books" "val"]
                                         :unique? false
                                         :index? false
                                         :value-type :blob
                                         :cardinality :one}]
                             [:add-triple id-1 id-aid (str id-1)]
                             [:add-triple id-1 title-aid "a"]
                             [:add-triple id-1 val-aid "a"]
                             [:add-triple id-2 id-aid (str id-2)]
                             [:add-triple id-2 title-aid "b"]
                             [:add-triple id-2 val-aid "b"]
                             [:add-triple id-null id-aid (str id-null)]
                             [:add-triple id-null title-aid "null"]
                             [:add-triple id-null val-aid nil]

                             [:add-triple id-undefined id-aid (str id-undefined)]
                             [:add-triple id-undefined title-aid "undefined"]])
            r (resolvers/make-zeneca-resolver (:id app))]
        (is-pretty-eq?
         (query-pretty (make-ctx)
                       r
                       {:books {:$ {:where {:val {:$not "a"}}}}})
         '({:topics
            ([:ea _ #{:books/val} {:$not "a"}]
             [:ea _ #{:books/id} _]
             [:ea _ #{:books/val} _]
             --
             [:ea #{"eid-b"} #{:books/val :books/id :books/title} _]
             --
             [:ea #{"eid-null"} #{:books/val :books/id :books/title} _]
             --
             [:ea #{"eid-undefined"} #{:books/val :books/id :books/title} _]),
            :triples
            (("eid-null" :books/id "eid-null")
             ("eid-undefined" :books/id "eid-undefined")
             ("eid-b" :books/val "b")
             ("eid-null" :books/val nil)
             --
             ("eid-b" :books/title "b")
             ("eid-b" :books/id "eid-b")
             ("eid-b" :books/val "b")
             --
             ("eid-null" :books/id "eid-null")
             ("eid-null" :books/title "null")
             ("eid-null" :books/val nil)
             --
             ("eid-undefined" :books/id "eid-undefined")
             ("eid-undefined" :books/title "undefined"))}))))))

(deftest where-$isNull
  (with-empty-app
    (fn [app]
      (let [make-ctx (fn []
                       (let [attrs (attr-model/get-by-app-id (:id app))]
                         {:db {:conn-pool (aurora/conn-pool)}
                          :app-id (:id app)
                          :attrs attrs}))

            id-aid (random-uuid)
            title-aid (random-uuid)
            val-aid (random-uuid)

            id-1 (random-uuid)
            id-2 (random-uuid)
            id-null (random-uuid)
            id-undefined (random-uuid)
            _ (tx/transact! (aurora/conn-pool)
                            (attr-model/get-by-app-id (:id app))
                            (:id app)
                            [[:add-attr {:id id-aid
                                         :forward-identity [(random-uuid) "books" "id"]
                                         :unique? true
                                         :index? true
                                         :value-type :blob
                                         :cardinality :one}]
                             [:add-attr {:id title-aid
                                         :forward-identity [(random-uuid) "books" "title"]
                                         :unique? false
                                         :index? false
                                         :value-type :blob
                                         :cardinality :one}]
                             [:add-attr {:id val-aid
                                         :forward-identity [(random-uuid) "books" "val"]
                                         :unique? false
                                         :index? false
                                         :value-type :blob
                                         :cardinality :one}]
                             [:add-triple id-1 id-aid (str id-1)]
                             [:add-triple id-1 title-aid "a"]
                             [:add-triple id-1 val-aid "a"]
                             [:add-triple id-2 id-aid (str id-2)]
                             [:add-triple id-2 title-aid "b"]
                             [:add-triple id-2 val-aid "b"]
                             [:add-triple id-null id-aid (str id-null)]
                             [:add-triple id-null title-aid "null"]
                             [:add-triple id-null val-aid nil]

                             [:add-triple id-undefined id-aid (str id-undefined)]
                             [:add-triple id-undefined title-aid "undefined"]])
            r (resolvers/make-zeneca-resolver (:id app))]
        (is-pretty-eq?
         (query-pretty (make-ctx)
                       r
                       {:books {:$ {:where {:val {:$isNull true}}}}})
         '({:topics
            ([:ea _ #{:books/id} _]
             [:ea _ #{:books/val} _]
             --
             [:ea #{"eid-null"} #{:books/val :books/id :books/title} _]
             --
             [:ea #{"eid-undefined"} #{:books/val :books/id :books/title} _]),
            :triples
            (("eid-null" :books/id "eid-null")
             ("eid-undefined" :books/id "eid-undefined")
             --
             ("eid-null" :books/id "eid-null")
             ("eid-null" :books/title "null")
             ("eid-null" :books/val nil)
             --
             ("eid-undefined" :books/id "eid-undefined")
             ("eid-undefined" :books/title "undefined"))}))

        (is-pretty-eq?
         (query-pretty (make-ctx)
                       r
                       {:books {:$ {:where {:val {:$isNull false}}}}})
         '({:topics
            ([:ea _ #{:books/id} _]
             [:ea _ #{:books/val} _]
             --
             [:ea #{"eid-b"} #{:books/val :books/id :books/title} _]
             --
             [:ea #{"eid-a"} #{:books/val :books/id :books/title} _]),
            :triples
            (("eid-a" :books/id "eid-a")
             ("eid-b" :books/id "eid-b")
             --
             ("eid-b" :books/title "b")
             ("eid-b" :books/id "eid-b")
             ("eid-b" :books/val "b")
             --
             ("eid-a" :books/title "a")
             ("eid-a" :books/id "eid-a")
             ("eid-a" :books/val "a"))}))))))

(defn add-references-to-app [app fwd rev]
  (let [fwd-id-aid (random-uuid)
        fwd-label-aid (random-uuid)
        fwd-prop-aid (random-uuid)
        rev-id-aid (random-uuid)
        rev-label-aid (random-uuid)
        rev-prop-aid (random-uuid)
        link-aid (random-uuid)

        fwd-a-id (random-uuid)
        fwd-b-id (random-uuid)
        fwd-c-id (random-uuid)
        fwd-d-id (random-uuid)
        fwd-null-id (random-uuid)
        fwd-undefined-id (random-uuid)
        rev-a-id (random-uuid)
        rev-b-id (random-uuid)
        rev-c-id (random-uuid)
        rev-d-id (random-uuid)
        rev-null-id (random-uuid)
        rev-undefined-id (random-uuid)
        _ (tx/transact! (aurora/conn-pool)
                        (attr-model/get-by-app-id (:id app))
                        (:id app)
                        [[:add-attr {:id fwd-id-aid
                                     :forward-identity [(random-uuid) "fwd" "id"]
                                     :unique? true
                                     :index? true
                                     :value-type :blob
                                     :cardinality :one}]
                         [:add-attr {:id fwd-label-aid
                                     :forward-identity [(random-uuid) "fwd" "label"]
                                     :unique? false
                                     :index? false
                                     :value-type :blob
                                     :cardinality :one}]
                         [:add-attr {:id fwd-prop-aid
                                     :forward-identity [(random-uuid) "fwd" "prop"]
                                     :unique? false
                                     :index? false
                                     :value-type :blob
                                     :cardinality :one}]
                         [:add-attr {:id rev-id-aid
                                     :forward-identity [(random-uuid) "rev" "id"]
                                     :unique? true
                                     :index? true
                                     :value-type :blob
                                     :cardinality :one}]
                         [:add-attr {:id rev-label-aid
                                     :forward-identity [(random-uuid) "rev" "label"]
                                     :unique? false
                                     :index? false
                                     :value-type :blob
                                     :cardinality :one}]
                         [:add-attr {:id rev-prop-aid
                                     :forward-identity [(random-uuid) "rev" "prop"]
                                     :unique? false
                                     :index? false
                                     :value-type :blob
                                     :cardinality :one}]
                         [:add-attr {:id link-aid
                                     :forward-identity [(random-uuid) "fwd" "rev"]
                                     :reverse-identity [(random-uuid) "rev" "fwd"]
                                     :unique? (= rev :one)
                                     :index? false
                                     :value-type :ref
                                     :cardinality fwd}]
                         [:add-triple fwd-a-id fwd-id-aid (str fwd-a-id)]
                         [:add-triple fwd-a-id fwd-label-aid "fwd-a"]
                         [:add-triple fwd-a-id fwd-prop-aid "a"]

                         [:add-triple fwd-b-id fwd-id-aid (str fwd-b-id)]
                         [:add-triple fwd-b-id fwd-label-aid "fwd-b"]
                         [:add-triple fwd-b-id fwd-prop-aid "b"]

                         [:add-triple fwd-c-id fwd-id-aid (str fwd-c-id)]
                         [:add-triple fwd-c-id fwd-label-aid "fwd-c"]
                         [:add-triple fwd-c-id fwd-prop-aid "c"]

                         [:add-triple fwd-d-id fwd-id-aid (str fwd-d-id)]
                         [:add-triple fwd-d-id fwd-label-aid "fwd-d"]
                         [:add-triple fwd-d-id fwd-prop-aid "d"]

                         [:add-triple fwd-null-id fwd-id-aid (str fwd-null-id)]
                         [:add-triple fwd-null-id fwd-label-aid "fwd-null"]
                         [:add-triple fwd-null-id fwd-prop-aid nil]

                         [:add-triple fwd-undefined-id fwd-id-aid (str fwd-undefined-id)]
                         [:add-triple fwd-undefined-id fwd-label-aid "fwd-undefined"]

                         [:add-triple rev-a-id rev-id-aid (str rev-a-id)]
                         [:add-triple rev-a-id rev-label-aid "rev-a"]
                         [:add-triple rev-a-id rev-prop-aid "a"]

                         [:add-triple rev-b-id rev-id-aid (str rev-b-id)]
                         [:add-triple rev-b-id rev-prop-aid "b"]
                         [:add-triple rev-b-id rev-label-aid "rev-b"]

                         [:add-triple rev-c-id rev-id-aid (str rev-c-id)]
                         [:add-triple rev-c-id rev-label-aid "rev-c"]
                         [:add-triple rev-c-id rev-prop-aid "c"]

                         [:add-triple rev-d-id rev-id-aid (str rev-d-id)]
                         [:add-triple rev-d-id rev-label-aid "rev-d"]
                         [:add-triple rev-d-id rev-prop-aid "d"]

                         [:add-triple rev-null-id rev-id-aid (str rev-null-id)]
                         [:add-triple rev-null-id rev-prop-aid nil]
                         [:add-triple rev-null-id rev-label-aid "rev-null"]

                         [:add-triple rev-undefined-id rev-id-aid (str rev-undefined-id)]
                         [:add-triple rev-undefined-id rev-label-aid "rev-undefined"]])

        r (resolvers/make-resolver {:conn-pool (aurora/conn-pool)}
                                   (:id app)
                                   [["fwd" "label"]
                                    ["rev" "label"]])

        add-links (fn [links]
                    (tx/transact! (aurora/conn-pool)
                                  (attr-model/get-by-app-id (:id app))
                                  (:id app)
                                  (mapv (fn [[fwd-id rev-id]]
                                          [:add-triple
                                           (resolvers/->uuid r fwd-id)
                                           link-aid
                                           (resolvers/->uuid r rev-id)])
                                        links)))
        clear-links (fn []
                      (def -t (tx/transact! (aurora/conn-pool)
                                            (attr-model/get-by-app-id (:id app))
                                            (:id app)
                                            (mapv (fn [{:keys [triple]}]
                                                    (let [[e a v] triple]
                                                      [:retract-triple e a v]))
                                                  (triple-model/fetch (aurora/conn-pool)
                                                                      (:id app)
                                                                      [[:= :attr-id link-aid]])))))
        admin-query (fn [q]
                      (let [ctx (let [attrs (attr-model/get-by-app-id (:id app))]
                                  {:db {:conn-pool (aurora/conn-pool)}
                                   :app-id (:id app)
                                   :attrs attrs})]
                        (->> (iq/query ctx q)
                             (instaql-nodes->object-tree ctx)
                             (resolvers/walk-friendly r))))]
    {:r r
     :add-links add-links
     :clear-links clear-links
     :admin-query admin-query}))

(deftest where-$not-$isNull-with-links-1-to-1
  (with-empty-app
    (fn [app]
      (let [{:keys [r add-links clear-links admin-query]}
            (add-references-to-app app
                                   :one
                                   :one)]
        (add-links [["eid-fwd-a" "eid-rev-a"
                     "eid-fwd-b" "eid-rev-null"
                     "eid-fwd-c" "eid-rev-undefined"]])

        (is (= #{"eid-fwd-b"
                 "eid-fwd-c"
                 "eid-fwd-d"
                 "eid-fwd-null"
                 "eid-fwd-undefined"}
               (as-> (admin-query {:fwd {:$ {:where {:rev.prop {:$isNull true}}}}}) %
                 (get % "fwd")
                 (map (fn [x] (get x "id")) %)
                 (set %))))

        (is (= #{"eid-fwd-a"}
               (as-> (admin-query {:fwd {:$ {:where {:rev.prop {:$isNull false}}}}}) %
                 (get % "fwd")
                 (map (fn [x] (get x "id")) %)
                 (set %))))

        (is (= #{"eid-fwd-b"
                 "eid-fwd-c"
                 "eid-fwd-d"
                 "eid-fwd-null"
                 "eid-fwd-undefined"}
               (as-> (admin-query {:fwd {:$ {:where {:rev.prop {:$not "a"}}}}}) %
                 (get % "fwd")
                 (map (fn [x] (get x "id")) %)
                 (set %))))

        (is (= #{"eid-rev-d"
                 "eid-rev-c"
                 "eid-rev-null"
                 "eid-rev-undefined"
                 "eid-rev-b"}
               (as-> (admin-query {:rev {:$ {:where {:fwd.prop {:$not "a"}}}}}) %
                 (get % "rev")
                 (map (fn [x] (get x "id")) %)
                 (set %))))

        (is (= #{"eid-rev-d"
                 "eid-rev-c"
                 "eid-rev-null"
                 "eid-rev-undefined"
                 "eid-rev-b"}
               (as-> (admin-query {:rev {:$ {:where {:fwd.prop {:$isNull true}}}}}) %
                 (get % "rev")
                 (map (fn [x] (get x "id")) %)
                 (set %))))

        (is (= #{"eid-rev-a"}
               (as-> (admin-query {:rev {:$ {:where {:fwd.prop {:$isNull false}}}}}) %
                 (get % "rev")
                 (map (fn [x] (get x "id")) %)
                 (set %))))

        (add-links [["eid-fwd-null" "eid-rev-b"]
                    ["eid-fwd-undefined" "eid-rev-c"]])

        (is (= #{"eid-rev-d"
                 "eid-rev-c"
                 "eid-rev-null"
                 "eid-rev-undefined"
                 "eid-rev-b"}
               (as-> (admin-query {:rev {:$ {:where {:fwd.prop {:$isNull true}}}}}) %
                 (get % "rev")
                 (map (fn [x] (get x "id")) %)
                 (set %))))))))

(deftest where-$not-$isNull-with-links-1-to-many
  (with-empty-app
    (fn [app]
      (let [{:keys [r add-links clear-links admin-query]}
            (add-references-to-app app
                                   :one
                                   :many)]
        (add-links [["eid-fwd-a" "eid-rev-a"
                     "eid-fwd-b" "eid-rev-a"
                     "eid-fwd-b" "eid-rev-null"
                     "eid-fwd-c" "eid-rev-undefined"]])

        (is (= #{"eid-fwd-b"
                 "eid-fwd-c"
                 "eid-fwd-d"
                 "eid-fwd-null"
                 "eid-fwd-undefined"}
               (as-> (admin-query {:fwd {:$ {:where {:rev.prop {:$isNull true}}}}}) %
                 (get % "fwd")
                 (map (fn [x] (get x "id")) %)
                 (set %))))

        (is (= #{"eid-fwd-a"}
               (as-> (admin-query {:fwd {:$ {:where {:rev.prop {:$isNull false}}}}}) %
                 (get % "fwd")
                 (map (fn [x] (get x "id")) %)
                 (set %))))

        (is (= #{"eid-fwd-b"
                 "eid-fwd-c"
                 "eid-fwd-d"
                 "eid-fwd-null"
                 "eid-fwd-undefined"}
               (as-> (admin-query {:fwd {:$ {:where {:rev.prop {:$not "a"}}}}}) %
                 (get % "fwd")
                 (map (fn [x] (get x "id")) %)
                 (set %))))

        (is (= #{"eid-rev-d"
                 "eid-rev-c"
                 "eid-rev-null"
                 "eid-rev-undefined"
                 "eid-rev-b"}
               (as-> (admin-query {:rev {:$ {:where {:fwd.prop {:$not "a"}}}}}) %
                 (get % "rev")
                 (map (fn [x] (get x "id")) %)
                 (set %))))

        (is (= #{"eid-rev-d"
                 "eid-rev-c"
                 "eid-rev-null"
                 "eid-rev-undefined"
                 "eid-rev-b"}
               (as-> (admin-query {:rev {:$ {:where {:fwd.prop {:$isNull true}}}}}) %
                 (get % "rev")
                 (map (fn [x] (get x "id")) %)
                 (set %))))

        (is (= #{"eid-rev-a"}
               (as-> (admin-query {:rev {:$ {:where {:fwd.prop {:$isNull false}}}}}) %
                 (get % "rev")
                 (map (fn [x] (get x "id")) %)
                 (set %))))

        (add-links [["eid-fwd-null" "eid-rev-b"]
                    ["eid-fwd-undefined" "eid-rev-c"]])

        (is (= #{"eid-rev-d"
                 "eid-rev-c"
                 "eid-rev-null"
                 "eid-rev-undefined"
                 "eid-rev-b"}
               (as-> (admin-query {:rev {:$ {:where {:fwd.prop {:$isNull true}}}}}) %
                 (get % "rev")
                 (map (fn [x] (get x "id")) %)
                 (set %))))))))

(deftest where-$not-$isNull-with-links-many-to-1
  (with-empty-app
    (fn [app]
      (let [{:keys [r add-links clear-links admin-query]}
            (add-references-to-app app
                                   :many
                                   :one)]
        (add-links [["eid-fwd-a" "eid-rev-a"
                     "eid-fwd-b" "eid-rev-b"
                     "eid-fwd-b" "eid-rev-null"
                     "eid-fwd-c" "eid-rev-undefined"]])

        (is (= #{"eid-fwd-b"
                 "eid-fwd-c"
                 "eid-fwd-d"
                 "eid-fwd-null"
                 "eid-fwd-undefined"}
               (as-> (admin-query {:fwd {:$ {:where {:rev.prop {:$isNull true}}}}}) %
                 (get % "fwd")
                 (map (fn [x] (get x "id")) %)
                 (set %))))

        (is (= #{"eid-fwd-a"}
               (as-> (admin-query {:fwd {:$ {:where {:rev.prop {:$isNull false}}}}}) %
                 (get % "fwd")
                 (map (fn [x] (get x "id")) %)
                 (set %))))

        (is (= #{"eid-fwd-b"
                 "eid-fwd-c"
                 "eid-fwd-d"
                 "eid-fwd-null"
                 "eid-fwd-undefined"}
               (as-> (admin-query {:fwd {:$ {:where {:rev.prop {:$not "a"}}}}}) %
                 (get % "fwd")
                 (map (fn [x] (get x "id")) %)
                 (set %))))

        (is (= #{"eid-rev-d"
                 "eid-rev-c"
                 "eid-rev-null"
                 "eid-rev-undefined"
                 "eid-rev-b"}
               (as-> (admin-query {:rev {:$ {:where {:fwd.prop {:$not "a"}}}}}) %
                 (get % "rev")
                 (map (fn [x] (get x "id")) %)
                 (set %))))

        (is (= #{"eid-rev-d"
                 "eid-rev-c"
                 "eid-rev-null"
                 "eid-rev-undefined"
                 "eid-rev-b"}
               (as-> (admin-query {:rev {:$ {:where {:fwd.prop {:$isNull true}}}}}) %
                 (get % "rev")
                 (map (fn [x] (get x "id")) %)
                 (set %))))

        (is (= #{"eid-rev-a"}
               (as-> (admin-query {:rev {:$ {:where {:fwd.prop {:$isNull false}}}}}) %
                 (get % "rev")
                 (map (fn [x] (get x "id")) %)
                 (set %))))

        (add-links [["eid-fwd-null" "eid-rev-b"]
                    ["eid-fwd-undefined" "eid-rev-c"]])

        (is (= #{"eid-rev-d"
                 "eid-rev-c"
                 "eid-rev-null"
                 "eid-rev-undefined"
                 "eid-rev-b"}
               (as-> (admin-query {:rev {:$ {:where {:fwd.prop {:$isNull true}}}}}) %
                 (get % "rev")
                 (map (fn [x] (get x "id")) %)
                 (set %))))))))

(deftest where-$not-$isNull-with-links-many-to-many
  (with-empty-app
    (fn [app]
      (let [{:keys [r add-links clear-links admin-query]}
            (add-references-to-app app
                                   :many
                                   :one)]
        (add-links [["eid-fwd-a" "eid-rev-a"
                     "eid-fwd-b" "eid-rev-a"
                     "eid-fwd-b" "eid-rev-b"
                     "eid-fwd-b" "eid-rev-null"
                     "eid-fwd-c" "eid-rev-undefined"]])

        (is (= #{"eid-fwd-b"
                 "eid-fwd-c"
                 "eid-fwd-d"
                 "eid-fwd-null"
                 "eid-fwd-undefined"}
               (as-> (admin-query {:fwd {:$ {:where {:rev.prop {:$isNull true}}}}}) %
                 (get % "fwd")
                 (map (fn [x] (get x "id")) %)
                 (set %))))

        (is (= #{"eid-fwd-a"}
               (as-> (admin-query {:fwd {:$ {:where {:rev.prop {:$isNull false}}}}}) %
                 (get % "fwd")
                 (map (fn [x] (get x "id")) %)
                 (set %))))

        (is (= #{"eid-fwd-b"
                 "eid-fwd-c"
                 "eid-fwd-d"
                 "eid-fwd-null"
                 "eid-fwd-undefined"}
               (as-> (admin-query {:fwd {:$ {:where {:rev.prop {:$not "a"}}}}}) %
                 (get % "fwd")
                 (map (fn [x] (get x "id")) %)
                 (set %))))

        (is (= #{"eid-rev-d"
                 "eid-rev-c"
                 "eid-rev-null"
                 "eid-rev-undefined"
                 "eid-rev-b"}
               (as-> (admin-query {:rev {:$ {:where {:fwd.prop {:$not "a"}}}}}) %
                 (get % "rev")
                 (map (fn [x] (get x "id")) %)
                 (set %))))

        (is (= #{"eid-rev-d"
                 "eid-rev-c"
                 "eid-rev-null"
                 "eid-rev-undefined"
                 "eid-rev-b"}
               (as-> (admin-query {:rev {:$ {:where {:fwd.prop {:$isNull true}}}}}) %
                 (get % "rev")
                 (map (fn [x] (get x "id")) %)
                 (set %))))

        (is (= #{"eid-rev-a"}
               (as-> (admin-query {:rev {:$ {:where {:fwd.prop {:$isNull false}}}}}) %
                 (get % "rev")
                 (map (fn [x] (get x "id")) %)
                 (set %))))

        (add-links [["eid-fwd-null" "eid-rev-b"]
                    ["eid-fwd-undefined" "eid-rev-c"]])

        (is (= #{"eid-rev-d"
                 "eid-rev-c"
                 "eid-rev-null"
                 "eid-rev-undefined"
                 "eid-rev-b"}
               (as-> (admin-query {:rev {:$ {:where {:fwd.prop {:$isNull true}}}}}) %
                 (get % "rev")
                 (map (fn [x] (get x "id")) %)
                 (set %))))))))

(deftest where-or
  (testing "with no matches"
    (is-pretty-eq?
     (query-pretty
      {:users {:$ {:where {:or [{:handle {:in ["nobody"]}}
                                {:handle "everybody"}]}}}})
     '({:topics
        ([:av _ #{:users/handle} #{"nobody"}]
         [:av _ #{:users/handle} #{"everybody"}]),
        :triples ()})))

  (testing "with matches"
    (is-pretty-eq?
     (query-pretty
      {:users {:$ {:where {:or [{:handle "joe"}
                                {:handle "stopa"}]}}}})
     '({:topics ([:av _ #{:users/handle} #{"stopa"}]
                 [:av _ #{:users/handle} #{"joe"}]
                 --
                 [:ea #{"eid-stepan-parunashvili"} #{:users/bookshelves
                                                     :users/createdAt
                                                     :users/email
                                                     :users/id
                                                     :users/fullName
                                                     :users/handle} _]
                 --
                 [:ea #{"eid-joe-averbukh"} #{:users/bookshelves
                                              :users/createdAt
                                              :users/email
                                              :users/id
                                              :users/fullName
                                              :users/handle} _]),
        :triples (("eid-joe-averbukh" :users/handle "joe")
                  ("eid-stepan-parunashvili" :users/handle "stopa")
                  --
                  ("eid-stepan-parunashvili" :users/createdAt "2021-01-07 18:50:43.447955")
                  ("eid-stepan-parunashvili" :users/fullName "Stepan Parunashvili")
                  ("eid-stepan-parunashvili" :users/handle "stopa")
                  ("eid-stepan-parunashvili" :users/email "stopa@instantdb.com")
                  ("eid-stepan-parunashvili" :users/id "eid-stepan-parunashvili")
                  --
                  ("eid-joe-averbukh" :users/id "eid-joe-averbukh")
                  ("eid-joe-averbukh" :users/handle "joe")
                  ("eid-joe-averbukh" :users/fullName "Joe Averbukh")
                  ("eid-joe-averbukh" :users/email "joe@instantdb.com")
                  ("eid-joe-averbukh" :users/createdAt "2021-01-07 18:51:23.742637"))})))

  (testing "with mix of matching and not matching clauses"
    (is-pretty-eq?
     (query-pretty
      {:users {:$ {:where {:or [{:handle "somebody"}
                                {:handle "joe"}
                                {:handle "nobody"}]}}}})
     '({:topics ([:av _ #{:users/handle} #{"somebody"}]
                 [:av _ #{:users/handle} #{"joe"}]
                 [:av _ #{:users/handle} #{"nobody"}]
                 --
                 [:ea #{"eid-joe-averbukh"} #{:users/bookshelves
                                              :users/createdAt
                                              :users/email
                                              :users/id
                                              :users/fullName
                                              :users/handle} _]),
        :triples (("eid-joe-averbukh" :users/handle "joe")
                  --
                  ("eid-joe-averbukh" :users/id "eid-joe-averbukh")
                  ("eid-joe-averbukh" :users/handle "joe")
                  ("eid-joe-averbukh" :users/fullName "Joe Averbukh")
                  ("eid-joe-averbukh" :users/email "joe@instantdb.com")
                  ("eid-joe-averbukh" :users/createdAt "2021-01-07 18:51:23.742637"))})))

  (testing "with nested relations"
    (is-pretty-eq?
     (query-pretty
      {:users {:$ {:where {:bookshelves.books.title "The Count of Monte Cristo"
                           :or [{:bookshelves.books.title "Musashi"
                                 :email "stopa@instantdb.com"}
                                {:handle "stopa"}]}}}})
     '({:topics
        ([:ea _ #{:books/title} #{"The Count of Monte Cristo"}]
         [:vae _ #{:bookshelves/books} #{"eid-the-count-of-monte-cristo"}]
         [:vae _ #{:users/bookshelves} #{"eid-the-way-of-the-gentleman"}]
         [:eav #{"eid-stepan-parunashvili"} #{:users/bookshelves} _]
         [:eav _ #{:bookshelves/books} _]
         [:ea _ #{:books/title} #{"Musashi"}]
         [:av
          #{"eid-stepan-parunashvili"}
          #{:users/email}
          #{"stopa@instantdb.com"}]
         [:av #{"eid-stepan-parunashvili"} #{:users/handle} #{"stopa"}]
         --
         [:ea
          #{"eid-stepan-parunashvili"}
          #{:users/bookshelves
            :users/createdAt
            :users/email
            :users/id
            :users/fullName
            :users/handle}
          _]),
        :triples
        (("eid-the-count-of-monte-cristo"
          :books/title
          "The Count of Monte Cristo")
         ("eid-the-count-of-monte-cristo"
          :books/title
          "The Count of Monte Cristo")
         ("eid-stepan-parunashvili" :users/email "stopa@instantdb.com")
         ("eid-the-way-of-the-gentleman" :bookshelves/books "eid-musashi")
         ("eid-musashi" :books/title "Musashi")
         ("eid-the-way-of-the-gentleman"
          :bookshelves/books
          "eid-the-count-of-monte-cristo")
         ("eid-the-way-of-the-gentleman"
          :bookshelves/books
          "eid-the-count-of-monte-cristo")
         ("eid-stepan-parunashvili"
          :users/bookshelves
          "eid-the-way-of-the-gentleman")
         ("eid-stepan-parunashvili"
          :users/bookshelves
          "eid-the-way-of-the-gentleman")
         ("eid-stepan-parunashvili"
          :users/bookshelves
          "eid-the-way-of-the-gentleman")
         ("eid-stepan-parunashvili" :users/handle "stopa")
         --
         ("eid-stepan-parunashvili" :users/email "stopa@instantdb.com")
         ("eid-stepan-parunashvili"
          :users/createdAt
          "2021-01-07 18:50:43.447955")
         ("eid-stepan-parunashvili" :users/fullName "Stepan Parunashvili")
         ("eid-stepan-parunashvili" :users/handle "stopa")
         ("eid-stepan-parunashvili" :users/id "eid-stepan-parunashvili")),
        :aggregate (nil nil)}))))

(deftest where-and
  (testing "with no matches"
    (is-pretty-eq?
     (query-pretty
      {:users {:$ {:where {:and [{:handle {:in ["nobody"]}}
                                 {:handle "everybody"}]}}}})
     '({:topics
        ([:av _ #{:users/handle} #{"nobody"}]
         [:av _ #{:users/handle} #{"everybody"}]),
        :triples (),
        :aggregate (nil)})))
  (testing "with matches"
    (let [expected '({:topics
                      ([:ea _ #{:books/title} #{"Musashi"}]
                       [:vae _ #{:bookshelves/books} #{"eid-musashi"}]
                       [:vae _ #{:users/bookshelves} #{"eid-the-way-of-the-gentleman"}]
                       [:ea _ #{:books/title} #{"The Count of Monte Cristo"}]
                       [:vae _ #{:bookshelves/books} #{"eid-the-count-of-monte-cristo"}]
                       [:vae
                        #{"eid-stepan-parunashvili"}
                        #{:users/bookshelves}
                        #{"eid-the-way-of-the-gentleman"}]
                       --
                       [:ea
                        #{"eid-stepan-parunashvili"}
                        #{:users/bookshelves
                          :users/createdAt
                          :users/email
                          :users/id
                          :users/fullName
                          :users/handle}
                        _]),
                      :triples
                      (("eid-the-count-of-monte-cristo"
                        :books/title
                        "The Count of Monte Cristo")
                       ("eid-the-way-of-the-gentleman" :bookshelves/books "eid-musashi")
                       ("eid-musashi" :books/title "Musashi")
                       ("eid-the-way-of-the-gentleman"
                        :bookshelves/books
                        "eid-the-count-of-monte-cristo")
                       ("eid-stepan-parunashvili"
                        :users/bookshelves
                        "eid-the-way-of-the-gentleman")
                       ("eid-stepan-parunashvili"
                        :users/bookshelves
                        "eid-the-way-of-the-gentleman")
                       --
                       ("eid-stepan-parunashvili" :users/email "stopa@instantdb.com")
                       ("eid-stepan-parunashvili"
                        :users/createdAt
                        "2021-01-07 18:50:43.447955")
                       ("eid-stepan-parunashvili" :users/fullName "Stepan Parunashvili")
                       ("eid-stepan-parunashvili" :users/handle "stopa")
                       ("eid-stepan-parunashvili" :users/id "eid-stepan-parunashvili")),
                      :aggregate (nil nil)})
          expected-triples (map :triples expected)]
      (is-pretty-eq?
       (query-pretty
        {:users {:$ {:where {:and [{:bookshelves.books.title "Musashi"}
                                   {:bookshelves.books.title "The Count of Monte Cristo"}]}}}})
       expected)

      (is-pretty-eq?
       (map :triples  (query-pretty
                       {:users {:$ {:where {:bookshelves.books.title "Musashi"
                                            :and [{:bookshelves.books.title "The Count of Monte Cristo"}]}}}}))
       expected-triples)))

  (testing "with nested ors"
    (is-pretty-eq?
     (query-pretty
      {:users {:$ {:where {:and [{:or [{:handle "somebody"}
                                       {:handle "joe"}
                                       {:handle "nobody"}
                                       {:handle "stopa"}
                                       {:and [{:or [{:handle "stopa"}]}]}]}]}}}})
     '({:topics ([:ea #{"eid-stepan-parunashvili"} #{:users/bookshelves
                                                     :users/createdAt
                                                     :users/email
                                                     :users/id
                                                     :users/fullName
                                                     :users/handle} _]
                 [:av _ #{:users/handle} #{"stopa"}]
                 [:av _ #{:users/handle} #{"somebody"}]
                 --
                 [:av _ #{:users/handle} #{"joe"}]
                 [:ea #{"eid-joe-averbukh"} #{:users/bookshelves
                                              :users/createdAt
                                              :users/email
                                              :users/id
                                              :users/fullName
                                              :users/handle} _]
                 [:av _ #{:users/handle} #{"nobody"}]),
        :triples (("eid-stepan-parunashvili" :users/email "stopa@instantdb.com")
                  ("eid-joe-averbukh" :users/fullName "Joe Averbukh")
                  ("eid-joe-averbukh" :users/handle "joe")
                  ("eid-stepan-parunashvili"
                   :users/createdAt
                   "2021-01-07 18:50:43.447955")
                  --
                  ("eid-stepan-parunashvili" :users/fullName "Stepan Parunashvili")
                  ("eid-stepan-parunashvili" :users/id "eid-stepan-parunashvili")
                  ("eid-joe-averbukh" :users/id "eid-joe-averbukh")
                  ("eid-stepan-parunashvili" :users/handle "stopa")
                  ("eid-joe-averbukh" :users/email "joe@instantdb.com")
                  ("eid-joe-averbukh" :users/createdAt "2021-01-07 18:51:23.742637"))}))))

(deftest comparators
  (with-empty-app
    (fn [app]
      (let [attr-ids {:string (random-uuid)
                      :number (random-uuid)
                      :boolean (random-uuid)
                      :date (random-uuid)}
            label-attr-id (random-uuid)
            labels ["a" "b" "c" "d" "e"]
            make-ctx (fn []
                       (let [attrs (attr-model/get-by-app-id (:id app))]
                         {:db {:conn-pool (aurora/conn-pool)}
                          :app-id (:id app)
                          :attrs attrs}))
            run-query (fn [return-field q]
                        (let [ctx (make-ctx)
                              r (resolvers/make-resolver {:conn-pool (aurora/conn-pool)}
                                                         (:id app)
                                                         [["books" "field"]
                                                          ["authors" "field"]])]
                          (->> (iq/permissioned-query ctx q)
                               (instaql-nodes->object-tree ctx)
                               (#(get % "etype"))
                               (map #(get % (name return-field)))
                               set)))
            run-explain (fn run-explain
                          ([data-type value]
                           (run-explain :$gt data-type value))
                          ([op data-type value]
                           (-> (d/explain (make-ctx)
                                          {:children
                                           {:pattern-groups
                                            [{:patterns
                                              [[{:idx-key :ave, :data-type data-type}
                                                '?etype-0
                                                (get attr-ids data-type)
                                                {:$comparator {:op op, :value value, :data-type data-type}}]]}]}})
                               (get "QUERY PLAN")
                               first
                               (get-in ["Plan" "Plans" 0 "Index Name"]))))]
        (tx/transact! (aurora/conn-pool)
                      (attr-model/get-by-app-id (:id app))
                      (:id app)
                      (concat
                       [[:add-attr {:id (random-uuid)
                                    :forward-identity [(random-uuid) "etype" "id"]
                                    :unique? true
                                    :index? true
                                    :value-type :blob
                                    :checked-data-type :string
                                    :cardinality :one}]
                        [:add-attr {:id label-attr-id
                                    :forward-identity [(random-uuid) "etype" "label"]
                                    :unique? true
                                    :index? true
                                    :value-type :blob
                                    :checked-data-type :string
                                    :cardinality :one}]]
                       (for [[t attr-id] attr-ids]
                         [:add-attr {:id attr-id
                                     :forward-identity [(random-uuid) "etype" (name t)]
                                     :unique? false
                                     :index? true
                                     :value-type :blob
                                     :checked-data-type t
                                     :cardinality :one}])

                       (mapcat
                        (fn [i]
                          (let [id (random-uuid)]
                            [[:add-triple id label-attr-id (nth labels i)]
                             [:add-triple id (:string attr-ids) (str i)]
                             [:add-triple id (:number attr-ids) i]
                             [:add-triple id (:date attr-ids) i]
                             [:add-triple id (:boolean attr-ids) (zero? (mod i 2))]]))
                        (range (count labels)))))
        (testing "string"
          (is (= #{"3" "4"} (run-query :string {:etype {:$ {:where {:string {:$gt "2"}}}}})))
          (is (= #{"2" "3" "4"} (run-query :string {:etype {:$ {:where {:string {:$gte "2"}}}}})))
          (is (= #{"0" "1"} (run-query :string {:etype {:$ {:where {:string {:$lt "2"}}}}})))
          (is (= #{"0" "1" "2"} (run-query :string {:etype {:$ {:where {:string {:$lte "2"}}}}})))
          (is (= #{"1"} (run-query :string {:etype {:$ {:where {:string "1"}}}})))
          (is (= #{"0" "2" "3" "4"} (run-query :string {:etype {:$ {:where {:string {:$not "1"}}}}})))

          (testing "uses index"
            (is (= "triples_string_trgm_gist_idx" (run-explain :string "2"))))

          (testing "like uses index"
            (is (= "triples_string_trgm_gist_idx" (run-explain :$like :string "%aaa")))))

        (testing "number"
          (is (= #{3 4} (run-query :number {:etype {:$ {:where {:number {:$gt 2}}}}})))
          (is (= #{2 3 4} (run-query :number {:etype {:$ {:where {:number {:$gte 2}}}}})))
          (is (= #{0 1} (run-query :number {:etype {:$ {:where {:number {:$lt 2}}}}})))
          (is (= #{0 1 2} (run-query :number {:etype {:$ {:where {:number {:$lte 2}}}}})))
          (is (= #{1} (run-query :number {:etype {:$ {:where {:number 1}}}})))
          (is (= #{0 2 3 4} (run-query :number {:etype {:$ {:where {:number {:$not 1}}}}})))

          (testing "uses index"
            (is (= "triples_number_type_idx" (run-explain :number 2)))))

        (testing "date"
          (is (= #{3 4} (run-query :date {:etype {:$ {:where {:date {:$gt 2}}}}})))
          (is (= #{2 3 4} (run-query :date {:etype {:$ {:where {:date {:$gte 2}}}}})))
          (is (= #{0 1} (run-query :date {:etype {:$ {:where {:date {:$lt 2}}}}})))
          (is (= #{0 1 2} (run-query :date {:etype {:$ {:where {:date {:$lte 2}}}}})))
          (is (= #{1} (run-query :date {:etype {:$ {:where {:date 1}}}})))
          (is (= #{1} (run-query :date {:etype {:$ {:where {:date (.toString (Instant/ofEpochMilli 1))}}}})))
          (is (= #{0 2 3 4} (run-query :date {:etype {:$ {:where {:date {:$not 1}}}}})))

          (testing "uses index"
            (is (= "triples_date_type_idx" (run-explain :date (Instant/ofEpochMilli 2))))))

        (testing "boolean"
          (is (= #{} (run-query :boolean {:etype {:$ {:where {:boolean {:$gt true}}}}})))
          (is (= #{true} (run-query :boolean {:etype {:$ {:where {:boolean {:$gt false}}}}})))
          (is (= #{true} (run-query :boolean {:etype {:$ {:where {:boolean {:$gte true}}}}})))
          (is (= #{} (run-query :boolean {:etype {:$ {:where {:boolean {:$lt false}}}}})))
          (is (= #{false} (run-query :boolean {:etype {:$ {:where {:boolean {:$lt true}}}}})))
          (is (= #{false true} (run-query :boolean {:etype {:$ {:where {:boolean {:$lte true}}}}})))
          (is (= #{true} (run-query :boolean {:etype {:$ {:where {:boolean true}}}})))
          (is (= #{false} (run-query :boolean {:etype {:$ {:where {:boolean {:$not true}}}}})))

          (testing "uses index"
            (is (= "triples_boolean_type_idx" (run-explain :boolean true)))))))))

(deftest arbitrary-order-by-all-types
  (with-empty-app
    (fn [app]
      (let [attr-ids {:string (random-uuid)
                      :number (random-uuid)
                      :boolean (random-uuid)
                      :date (random-uuid)}
            id-attr (random-uuid)
            label-attr-id (random-uuid)
            labels ["a" "b" "c" "d" "e"]
            make-ctx (fn []
                       (let [attrs (attr-model/get-by-app-id (:id app))]
                         {:db {:conn-pool (aurora/conn-pool)}
                          :app-id (:id app)
                          :attrs attrs}))
            run-query (fn [return-field q]
                        (let [ctx (make-ctx)]
                          (->> (iq/query ctx q)
                               (instaql-nodes->object-tree ctx)
                               (#(get % "etype"))
                               (map #(get % (name return-field))))))
            _ (tx/transact! (aurora/conn-pool)
                            (attr-model/get-by-app-id (:id app))
                            (:id app)
                            (concat
                             [[:add-attr {:id id-attr
                                          :forward-identity [(random-uuid) "etype" "id"]
                                          :unique? true
                                          :index? true
                                          :value-type :blob
                                          :checked-data-type :string
                                          :cardinality :one}]
                              [:add-attr {:id label-attr-id
                                          :forward-identity [(random-uuid) "etype" "label"]
                                          :unique? true
                                          :index? true
                                          :value-type :blob
                                          :checked-data-type :string
                                          :cardinality :one}]]
                             (for [[t attr-id] attr-ids]
                               [:add-attr {:id attr-id
                                           :forward-identity [(random-uuid) "etype" (name t)]
                                           :unique? false
                                           :index? true
                                           :value-type :blob
                                           :checked-data-type t
                                           :cardinality :one}])

                             (mapcat
                              (fn [i]
                                (let [id (random-uuid)]
                                  [[:add-triple id id-attr (str id)]
                                   [:add-triple id label-attr-id (nth labels i)]
                                   [:add-triple id (:string attr-ids) (str i)]
                                   [:add-triple id (:number attr-ids) i]
                                   [:add-triple id (:date attr-ids) i]
                                   [:add-triple id (:boolean attr-ids) (zero? (mod i 2))]]))
                              (range (count labels)))))
            r (resolvers/make-resolver {:conn-pool (aurora/conn-pool)}
                                       (:id app)
                                       [["etype" "label"]])]

        (testing "string"

          (is (= ["0" "1" "2" "3" "4"] (run-query :string {:etype {:$ {:order {:string :asc}}}})))
          (is (= ["4" "3" "2" "1" "0"] (run-query :string {:etype {:$ {:order {:string :desc}}}})))

          (is (= ["4" "3" "2"] (run-query :string {:etype {:$ {:where {:string {:$gte "2"}}
                                                               :order {:string :desc}}}})))

          (is (= ["3" "4"] (run-query :string {:etype {:$ {:order {:string :asc}
                                                           :after [(resolvers/->uuid r "eid-c")
                                                                   (resolvers/->uuid r :etype/string)
                                                                   "2"
                                                                   0]}}}))))

        (testing "number"

          (is (= [0 1 2 3 4] (run-query :number {:etype {:$ {:order {:number :asc}}}})))
          (is (= [4 3 2 1 0] (run-query :number {:etype {:$ {:order {:number :desc}}}})))

          (is (= [4 3 2] (run-query :number {:etype {:$ {:where {:number {:$gte 2}}
                                                         :order {:number :desc}}}})))

          (is (= [3 4] (run-query :number {:etype {:$ {:order {:number :asc}
                                                       :after [(resolvers/->uuid r "eid-c")
                                                               (resolvers/->uuid r :etype/number)
                                                               2
                                                               0]}}}))))

        (testing "date"

          (is (= [0 1 2 3 4] (run-query :date {:etype {:$ {:order {:date :asc}}}})))
          (is (= [4 3 2 1 0] (run-query :date {:etype {:$ {:order {:date :desc}}}})))

          (is (= [4 3 2] (run-query :date {:etype {:$ {:where {:date {:$gte 2}}
                                                       :order {:date :desc}}}})))

          (is (= [3 4] (run-query :date {:etype {:$ {:order {:date :asc}
                                                     :after [(resolvers/->uuid r "eid-c")
                                                             (resolvers/->uuid r :etype/date)
                                                             2
                                                             0]}}}))))

        (testing "boolean"

          (is (= [false false true true true] (run-query :boolean {:etype {:$ {:order {:boolean :asc}}}})))
          (is (= [true true true false false] (run-query :boolean {:etype {:$ {:order {:boolean :desc}}}})))

          (is (= [true true true] (run-query :boolean {:etype {:$ {:where {:boolean {:$gte true}}
                                                                   :order {:boolean :desc}}}}))))))))

(deftest nested-order-by
  (with-zeneca-checked-data-app
    (fn [app r]
      (let [ctx {:db {:conn-pool (aurora/conn-pool)}
                 :app-id (:id app)
                 :attrs (attr-model/get-by-app-id (:id app))}]
        (is (= [0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15]
               (-> (instaql-nodes->object-tree
                    ctx
                    (iq/query ctx
                              {:users
                               {:$ {:where {:handle "stopa"}}
                                :bookshelves {:$ {:order {:order "asc"}}}}}))

                   (get "users")
                   first
                   (get "bookshelves")
                   (#(map (fn [x] (get x "order")) %)))))
        (is (= [15 14 13 12 11 10 9 8 7 6 5 4 3 2 1 0]
               (-> (instaql-nodes->object-tree
                    ctx
                    (iq/query ctx
                              {:users
                               {:$ {:where {:handle "stopa"}}
                                :bookshelves {:$ {:order {:order "desc"}}}}}))

                   (get "users")
                   first
                   (get "bookshelves")
                   (#(map (fn [x] (get x "order")) %)))))))))

(deftest order-by-with-ors-and-ands
  (with-zeneca-checked-data-app
    (fn [app r]
      (let [ctx {:db {:conn-pool (aurora/conn-pool)}
                 :app-id (:id app)
                 :attrs (attr-model/get-by-app-id (:id app))}]
        (is (= [[0 1 2 3 4 5 6 7 8 9 10] [0 1]]
               (-> (instaql-nodes->object-tree
                    ctx
                    (iq/query ctx
                              {:users
                               {:$ {:where {:or [{:handle "alex"}
                                                 {:handle "nicolegf"}]}
                                    :order {:handle "desc"}}
                                :bookshelves {:$ {:order {:order "asc"}}}}}))

                   (get "users")
                   (#(map (fn [u] (map (fn [b] (get b "order"))
                                       (get u "bookshelves")))
                          %)))))
        (is (= [15 14 13 12 11 10 9 8 7 6 5 4 3 2 1 0]
               (-> (instaql-nodes->object-tree
                    ctx
                    (iq/query ctx
                              {:users
                               {:$ {:where {:and [{:handle "stopa"}
                                                  {:bookshelves.order 0}
                                                  {:email "stopa@instantdb.com"}]}}
                                :bookshelves {:$ {:order {:order "desc"}}}}}))

                   (get "users")
                   first
                   (get "bookshelves")
                   (#(map (fn [x] (get x "order")) %)))))))))

(deftest child-forms
  (testing "no child where"
    (is-pretty-eq?
     (query-pretty
      {:users {:$ {:where {:handle "alex"}},
               :bookshelves {}}})
     '({:topics
        ([:av _ #{:users/handle} #{"alex"}]
         --
         [:ea #{"eid-alex"} #{:users/bookshelves
                              :users/createdAt
                              :users/email
                              :users/id
                              :users/fullName
                              :users/handle} _]
         --
         [:eav #{"eid-alex"} #{:users/bookshelves} _]
         --
         [:ea #{"eid-short-stories"} #{:bookshelves/desc
                                       :bookshelves/name
                                       :bookshelves/order
                                       :bookshelves/id
                                       :bookshelves/books} _]
         --
         [:ea #{"eid-nonfiction"} #{:bookshelves/desc
                                    :bookshelves/name
                                    :bookshelves/order
                                    :bookshelves/id
                                    :bookshelves/books} _]),
        :triples
        (["eid-alex" :users/handle "alex"]
         --
         ["eid-alex" :users/createdAt "2021-01-09 18:53:07.993689"]
         ["eid-alex" :users/email "alex@instantdb.com"]
         ["eid-alex" :users/fullName "Alex"]
         ["eid-alex" :users/handle "alex"]
         ["eid-alex" :users/id "eid-alex"]
         --
         ["eid-alex" :users/bookshelves "eid-nonfiction"]
         ["eid-alex" :users/bookshelves "eid-short-stories"]
         --
         ["eid-short-stories" :bookshelves/desc ""]
         ["eid-short-stories" :bookshelves/id "eid-short-stories"]
         ["eid-short-stories" :bookshelves/name "Short Stories"]
         ["eid-short-stories" :bookshelves/order 0]
         --
         ["eid-nonfiction" :bookshelves/desc ""]
         ["eid-nonfiction" :bookshelves/id "eid-nonfiction"]
         ["eid-nonfiction" :bookshelves/name "Nonfiction"]
         ["eid-nonfiction" :bookshelves/order 1])})))
  (testing "reverse lookup"
    (is-pretty-eq?
     (query-pretty
      {:bookshelves {:$ {:where {:name "Nonfiction"}}, :users {}}})
     '({:topics
        ([:ea _ #{:bookshelves/name} #{"Nonfiction"}]
         --
         [:ea #{"eid-nonfiction"} #{:bookshelves/desc
                                    :bookshelves/name
                                    :bookshelves/order
                                    :bookshelves/id
                                    :bookshelves/books} _]
         --
         [:vae _ #{:users/bookshelves} #{"eid-nonfiction"}]
         --
         [:ea #{"eid-alex"} #{:users/bookshelves
                              :users/createdAt
                              :users/email
                              :users/id
                              :users/fullName
                              :users/handle} _]),
        :triples
        (["eid-nonfiction" :bookshelves/name "Nonfiction"]
         --
         ["eid-nonfiction" :bookshelves/desc ""]
         ["eid-nonfiction" :bookshelves/id "eid-nonfiction"]
         ["eid-nonfiction" :bookshelves/name "Nonfiction"]
         ["eid-nonfiction" :bookshelves/order 1]
         --
         ["eid-alex" :users/bookshelves "eid-nonfiction"]
         --
         ["eid-alex" :users/createdAt "2021-01-09 18:53:07.993689"]
         ["eid-alex" :users/email "alex@instantdb.com"]
         ["eid-alex" :users/fullName "Alex"]
         ["eid-alex" :users/handle "alex"]
         ["eid-alex" :users/id "eid-alex"])})))
  (testing "inner where clause"
    (is-pretty-eq?
     (query-pretty
      {:users
       {:$ {:where {:handle "alex"}},
        :bookshelves {:$ {:where {:name "Nonfiction"}}}}})
     '({:topics
        ([:av _ #{:users/handle} #{"alex"}]
         --
         [:ea #{"eid-alex"} #{:users/bookshelves
                              :users/createdAt
                              :users/email
                              :users/id
                              :users/fullName
                              :users/handle} _]
         --
         [:eav #{"eid-alex"} #{:users/bookshelves} _]
         [:ea _ #{:bookshelves/name} #{"Nonfiction"}]
         --
         [:ea #{"eid-nonfiction"} #{:bookshelves/desc
                                    :bookshelves/name
                                    :bookshelves/order
                                    :bookshelves/id
                                    :bookshelves/books} _]),
        :triples
        (["eid-alex" :users/handle "alex"]
         --
         ["eid-alex" :users/createdAt "2021-01-09 18:53:07.993689"]
         ["eid-alex" :users/email "alex@instantdb.com"]
         ["eid-alex" :users/fullName "Alex"]
         ["eid-alex" :users/handle "alex"]
         ["eid-alex" :users/id "eid-alex"]
         --
         ["eid-alex" :users/bookshelves "eid-nonfiction"]
         ["eid-nonfiction" :bookshelves/name "Nonfiction"]
         --
         ["eid-nonfiction" :bookshelves/desc ""]
         ["eid-nonfiction" :bookshelves/id "eid-nonfiction"]
         ["eid-nonfiction" :bookshelves/name "Nonfiction"]
         ["eid-nonfiction" :bookshelves/order 1])})))

  (testing "inner where clause with ors"
    (is-pretty-eq?
     (query-pretty
      {:users
       {:$ {:where {:handle "alex"}},
        :bookshelves {:$ {:where {:or [{:name "Nonfiction"}
                                       {:name "Fiction"}]}}}}})
     '({:topics
        ([:av _ #{:users/handle} #{"alex"}]
         --
         [:ea #{"eid-alex"} #{:users/bookshelves
                              :users/createdAt
                              :users/email
                              :users/id
                              :users/fullName
                              :users/handle} _]
         --
         [:eav #{"eid-alex"} #{:users/bookshelves} _]
         [:ea _ #{:bookshelves/name} #{"Nonfiction"}]
         [:ea _ #{:bookshelves/name} #{"Fiction"}]
         --
         [:ea #{"eid-nonfiction"} #{:bookshelves/desc
                                    :bookshelves/name
                                    :bookshelves/order
                                    :bookshelves/id
                                    :bookshelves/books} _]),
        :triples
        (["eid-alex" :users/handle "alex"]
         --
         ["eid-alex" :users/createdAt "2021-01-09 18:53:07.993689"]
         ["eid-alex" :users/email "alex@instantdb.com"]
         ["eid-alex" :users/fullName "Alex"]
         ["eid-alex" :users/handle "alex"]
         ["eid-alex" :users/id "eid-alex"]
         --
         ["eid-alex" :users/bookshelves "eid-nonfiction"]
         ["eid-nonfiction" :bookshelves/name "Nonfiction"]
         --
         ["eid-nonfiction" :bookshelves/desc ""]
         ["eid-nonfiction" :bookshelves/id "eid-nonfiction"]
         ["eid-nonfiction" :bookshelves/name "Nonfiction"]
         ["eid-nonfiction" :bookshelves/order 1])})))

  (testing "inner where clause with ands"
    (is-pretty-eq?
     (query-pretty
      {:users
       {:$ {:where {:handle "alex"}},
        :bookshelves {:$ {:where {:and [{:name "Nonfiction"}
                                        {:order 1}]}}}}})
     '({:topics
        ([:ea #{"eid-nonfiction"} #{:bookshelves/desc
                                    :bookshelves/name
                                    :bookshelves/order
                                    :bookshelves/id
                                    :bookshelves/books} _]
         [:eav #{"eid-alex"} #{:users/bookshelves} _]
         [:ea _ #{:bookshelves/name} #{"Nonfiction"}]
         --
         [:ea #{"eid-alex"} #{:users/bookshelves
                              :users/createdAt
                              :users/email
                              :users/id
                              :users/fullName
                              :users/handle} _]
         [:av _ #{:users/handle} #{"alex"}]
         [:ea #{"eid-nonfiction"} #{:bookshelves/order} #{1}]),
        :triples
        (["eid-alex" :users/handle "alex"]
         --
         ["eid-alex" :users/createdAt "2021-01-09 18:53:07.993689"]
         ["eid-alex" :users/email "alex@instantdb.com"]
         ["eid-alex" :users/fullName "Alex"]
         ["eid-alex" :users/handle "alex"]
         ["eid-alex" :users/id "eid-alex"]
         --
         ["eid-alex" :users/bookshelves "eid-nonfiction"]
         ["eid-nonfiction" :bookshelves/name "Nonfiction"]
         --
         ["eid-nonfiction" :bookshelves/desc ""]
         ["eid-nonfiction" :bookshelves/id "eid-nonfiction"]
         ["eid-nonfiction" :bookshelves/name "Nonfiction"]
         ["eid-nonfiction" :bookshelves/order 1])}))))

(deftest missing-attrs
  (testing "missing top-level etype returns empty triples"
    (is-pretty-eq?
     (query-pretty
      {:zippy {}})
     '({:topics ([:ea _ _ _] [:eav _ _ _]), :triples ()})))
  (testing "missing attr in a where returns empty triples"
    (is-pretty-eq?
     (query-pretty
      {:users {:$ {:where {:bookshelves.zippy "alex"}}}})
     '({:topics ([:ea _ _ _] [:eav _ _ _]), :triples ()})))
  (testing "missing ref attr doesn't parent query"
    (is-pretty-eq?
     (query-pretty
      {:users {:zippy {}}})
     '({:topics
        ([:eav _ #{:users/id} _]
         --
         [:ea #{"eid-stepan-parunashvili"} #{:users/bookshelves
                                             :users/createdAt
                                             :users/email
                                             :users/id
                                             :users/fullName
                                             :users/handle} _]
         --
         [:ea _ _ _]
         [:eav _ _ _]
         --
         [:ea #{"eid-nicole"} #{:users/bookshelves
                                :users/createdAt
                                :users/email
                                :users/id
                                :users/fullName
                                :users/handle} _]
         --
         [:ea _ _ _]
         [:eav _ _ _]
         --
         [:ea #{"eid-joe-averbukh"} #{:users/bookshelves
                                      :users/createdAt
                                      :users/email
                                      :users/id
                                      :users/fullName
                                      :users/handle} _]
         --
         [:ea _ _ _]
         [:eav _ _ _]
         --
         [:ea #{"eid-alex"} #{:users/bookshelves
                              :users/createdAt
                              :users/email
                              :users/id
                              :users/fullName
                              :users/handle} _]
         --
         [:ea _ _ _]
         [:eav _ _ _]),
        :triples
        (["eid-alex" :users/id "eid-alex"]
         ["eid-joe-averbukh" :users/id "eid-joe-averbukh"]
         ["eid-nicole" :users/id "eid-nicole"]
         ["eid-stepan-parunashvili" :users/id "eid-stepan-parunashvili"]
         --
         ["eid-stepan-parunashvili"
          :users/createdAt
          "2021-01-07 18:50:43.447955"]
         ["eid-stepan-parunashvili" :users/email "stopa@instantdb.com"]
         ["eid-stepan-parunashvili" :users/fullName "Stepan Parunashvili"]
         ["eid-stepan-parunashvili" :users/handle "stopa"]
         ["eid-stepan-parunashvili" :users/id "eid-stepan-parunashvili"]
         --
         --
         ["eid-nicole"
          :users/createdAt
          "2021-02-05 22:35:23.754264"]
         ["eid-nicole" :users/email "nicole@instantdb.com"]
         ["eid-nicole"
          :users/fullName
          "Nicole"]
         ["eid-nicole" :users/handle "nicolegf"]
         ["eid-nicole" :users/id "eid-nicole"]
         --
         --
         ["eid-joe-averbukh" :users/createdAt "2021-01-07 18:51:23.742637"]
         ["eid-joe-averbukh" :users/email "joe@instantdb.com"]
         ["eid-joe-averbukh" :users/fullName "Joe Averbukh"]
         ["eid-joe-averbukh" :users/handle "joe"]
         ["eid-joe-averbukh" :users/id "eid-joe-averbukh"]
         --
         --
         ["eid-alex" :users/createdAt "2021-01-09 18:53:07.993689"]
         ["eid-alex" :users/email "alex@instantdb.com"]
         ["eid-alex" :users/fullName "Alex"]
         ["eid-alex" :users/handle "alex"]
         ["eid-alex" :users/id "eid-alex"]
         --)}))))

(deftest same-ids
  (with-zeneca-app
    (fn [app r]
      (let [ctx {:db {:conn-pool (aurora/conn-pool)}
                 :app-id (:id app)
                 :attrs (attr-model/get-by-app-id (:id app))}
            user-id-attr (resolvers/->uuid r :users/id)
            user-handle-attr (resolvers/->uuid r :users/handle)
            book-id-attr (resolvers/->uuid r :books/id)
            book-title-attr (resolvers/->uuid r :books/title)
            shared-id (random-uuid)]
        (tx/transact! (aurora/conn-pool)
                      (attr-model/get-by-app-id (:id app))
                      (:id app)
                      [[:add-triple shared-id user-id-attr shared-id]
                       [:add-triple shared-id user-handle-attr "handle"]
                       [:add-triple shared-id book-id-attr shared-id]
                       [:add-triple shared-id book-title-attr "title"]])
        (is-pretty-eq?
         (query-pretty ctx r {:users {:$ {:where {:id shared-id}}}})
         [{:topics
           [[:av '_ #{:users/id} #{shared-id}]
            '--
            [:ea
             #{shared-id}
             #{:users/bookshelves
               :users/createdAt
               :users/email
               :users/id
               :users/fullName
               :users/handle}
             '_]],
           :triples
           [[shared-id :users/id shared-id]
            '--
            [shared-id :users/handle "handle"]
            [shared-id :users/id shared-id]]}])
        (is-pretty-eq?
         (query-pretty ctx r {:books {:$ {:where {:id shared-id}}}})
         [{:topics
           [[:av '_ #{:books/id} #{shared-id}]
            '--
            [:ea #{shared-id} #{:books/pageCount
                                :books/isbn13
                                :books/description
                                :books/id
                                :books/thumbnail
                                :books/title} '_]],
           :triples
           [[shared-id :books/id shared-id]
            '--
            [shared-id :books/title "title"]
            [shared-id :books/id shared-id]]}])))))

(deftest eid-relations
  (testing "forward works on link name"
    (is-pretty-eq?
     (query-pretty {:users {:$ {:where {:bookshelves (resolvers/->uuid @r "eid-worldview")}}}})
     '({:topics
        ([:vae _ #{:users/bookshelves} #{"eid-worldview"}]
         --
         [:ea
          #{"eid-stepan-parunashvili"}
          #{:users/bookshelves
            :users/createdAt
            :users/email
            :users/id
            :users/fullName
            :users/handle}
          _]),
        :triples
        (("eid-stepan-parunashvili" :users/bookshelves "eid-worldview")
         --
         ("eid-stepan-parunashvili" :users/email "stopa@instantdb.com")
         ("eid-stepan-parunashvili"
          :users/createdAt
          "2021-01-07 18:50:43.447955")
         ("eid-stepan-parunashvili" :users/fullName "Stepan Parunashvili")
         ("eid-stepan-parunashvili" :users/handle "stopa")
         ("eid-stepan-parunashvili" :users/id "eid-stepan-parunashvili"))})))
  (testing "reverse works on link name"
    (is-pretty-eq?
     (query-pretty {:bookshelves {:$ {:where {:users (resolvers/->uuid @r "eid-alex")}}}})
     '({:topics
        ([:eav #{"eid-alex"} #{:users/bookshelves} _]
         --
         [:ea
          #{"eid-short-stories"}
          #{:bookshelves/desc
            :bookshelves/name
            :bookshelves/order
            :bookshelves/id
            :bookshelves/books}
          _]
         --
         [:ea
          #{"eid-nonfiction"}
          #{:bookshelves/desc
            :bookshelves/name
            :bookshelves/order
            :bookshelves/id
            :bookshelves/books}
          _]),
        :triples
        (("eid-alex" :users/bookshelves "eid-short-stories")
         ("eid-alex" :users/bookshelves "eid-nonfiction")
         --
         ("eid-short-stories" :bookshelves/id "eid-short-stories")
         ("eid-short-stories" :bookshelves/desc "")
         ("eid-short-stories" :bookshelves/name "Short Stories")
         ("eid-short-stories" :bookshelves/order 0)
         --
         ("eid-nonfiction" :bookshelves/id "eid-nonfiction")
         ("eid-nonfiction" :bookshelves/name "Nonfiction")
         ("eid-nonfiction" :bookshelves/desc "")
         ("eid-nonfiction" :bookshelves/order 1))}))))

(deftest indexing?
  (testing "queries ignore indexes while still indexing"
    (with-empty-app
      (fn [app]
        (let [make-ctx (fn []
                         ;; pass in conn-pool to bypass cache
                         (let [attrs (attr-model/get-by-app-id (aurora/conn-pool) (:id app))]
                           {:db {:conn-pool (aurora/conn-pool)}
                            :app-id (:id app)
                            :attrs attrs}))
              app-id (:id app)

              uid-attr-id (random-uuid)
              handle-attr-id (random-uuid)
              eid (random-uuid)

              _ (tx/transact! (aurora/conn-pool)
                              (attr-model/get-by-app-id app-id)
                              app-id
                              [[:add-attr {:id uid-attr-id
                                           :forward-identity [(random-uuid) "users" "id"]
                                           :unique? true
                                           :index? true
                                           :value-type :blob
                                           :cardinality :one}]
                               [:add-attr {:id handle-attr-id
                                           :forward-identity [(random-uuid) "users" "handle"]
                                           :unique? false
                                           :index? false
                                           :value-type :blob
                                           :cardinality :one}]
                               [:add-triple eid uid-attr-id eid]
                               [:add-triple eid handle-attr-id "dww"]])
              r (resolvers/make-resolver (:db (make-ctx)) (:id app) [["users" "handle"]])
              before-index-result '({:topics
                                     ([:ea _ #{:users/handle} #{"dww"}]
                                      --
                                      [:ea #{"eid-dww"} #{:users/id :users/handle} _]),
                                     :triples
                                     (("eid-dww" :users/handle "dww")
                                      --
                                      ("eid-dww" :users/id "eid-dww")
                                      ("eid-dww" :users/handle "dww")),
                                     :aggregate (nil nil)})]
          (is-pretty-eq?
           (query-pretty (make-ctx) r {:users {:$ {:where {:handle "dww"}}}})
           before-index-result)

          (attr-model/with-cache-invalidation app-id
            (sql/execute! (aurora/conn-pool)
                          ["update attrs set is_indexed = true where id = ?"
                           handle-attr-id]))

          (testing "incorrect indexes would break the query"
            (is-pretty-eq?
             (query-pretty (make-ctx) r {:users {:$ {:where {:handle "dww"}}}})
             '({:topics ([:ave _ #{:users/handle} #{"dww"}]),
                :triples (),
                :aggregate (nil)})))

          (attr-model/with-cache-invalidation app-id
            (sql/execute! (aurora/conn-pool)
                          ["update attrs set indexing = true where id = ?"
                           handle-attr-id]))

          (testing "setting in-progress saves the query"
            (is-pretty-eq?
             (query-pretty (make-ctx) r {:users {:$ {:where {:handle "dww"}}}})
             before-index-result)))))))

(deftest uniqueing?
  (testing "queries ignore unique? while still uniqueing?"
    (with-empty-app
      (fn [app]
        (let [make-ctx (fn []
                         ;; pass in conn-pool to bypass cache
                         (let [attrs (attr-model/get-by-app-id (aurora/conn-pool) (:id app))]
                           {:db {:conn-pool (aurora/conn-pool)}
                            :app-id (:id app)
                            :attrs attrs}))
              app-id (:id app)

              uid-attr-id (random-uuid)
              handle-attr-id (random-uuid)
              eid (random-uuid)

              _ (tx/transact! (aurora/conn-pool)
                              (attr-model/get-by-app-id app-id)
                              app-id
                              [[:add-attr {:id uid-attr-id
                                           :forward-identity [(random-uuid) "users" "id"]
                                           :unique? true
                                           :index? true
                                           :value-type :blob
                                           :cardinality :one}]
                               [:add-attr {:id handle-attr-id
                                           :forward-identity [(random-uuid) "users" "handle"]
                                           :unique? false
                                           :index? false
                                           :value-type :blob
                                           :cardinality :one}]
                               [:add-triple eid uid-attr-id eid]
                               [:add-triple eid handle-attr-id "dww"]])
              r (resolvers/make-resolver (:db (make-ctx)) (:id app) [["users" "handle"]])
              before-index-result '({:topics
                                     ([:ea _ #{:users/handle} #{"dww"}]
                                      --
                                      [:ea #{"eid-dww"} #{:users/id :users/handle} _]),
                                     :triples
                                     (("eid-dww" :users/handle "dww")
                                      --
                                      ("eid-dww" :users/id "eid-dww")
                                      ("eid-dww" :users/handle "dww")),
                                     :aggregate (nil nil)})]
          (is-pretty-eq?
           (query-pretty (make-ctx) r {:users {:$ {:where {:handle "dww"}}}})
           before-index-result)

          (attr-model/with-cache-invalidation app-id
            (sql/execute! (aurora/conn-pool)
                          ["update attrs set is_unique = true where id = ?"
                           handle-attr-id]))

          (testing "incorrect indexes would break the query"
            (is-pretty-eq?
             (query-pretty (make-ctx) r {:users {:$ {:where {:handle "dww"}}}})
             '({:topics ([:av _ #{:users/handle} #{"dww"}]),
                :triples (),
                :aggregate (nil)})))

          (attr-model/with-cache-invalidation app-id
            (sql/execute! (aurora/conn-pool)
                          ["update attrs set setting_unique = true where id = ?"
                           handle-attr-id]))

          (testing "setting in-progress saves the query"
            (is-pretty-eq?
             (query-pretty (make-ctx) r {:users {:$ {:where {:handle "dww"}}}})
             before-index-result)))))))

;; -----------
;; Permissions

(comment
  (def app-id #uuid "2f23dfa2-c921-4988-9243-adf602339bab")
  (def app
    (app-model/create! {:title "test app"
                        :creator-id instant.data.constants/test-user-id
                        :id app-id
                        :admin-token (UUID/randomUUID)}))
  (bootstrap/add-zeneca-to-app! app-id)
  (app-model/delete-by-id! {:id app-id}))

(deftest default-perms
  (doseq [[app-fn description] [[with-zeneca-app "without checked attrs"]
                                [with-zeneca-checked-data-app "with checked attrs"]]]
    (testing description
      (app-fn
       (fn [{app-id :id :as _app} _r]
         (are [rules result] (= result
                                (do
                                  (rule-model/put! (aurora/conn-pool) {:app-id app-id :code rules})
                                  (->> (pretty-perm-q {:app-id app-id :current-user nil} {:users {}}) :users (map :handle) set)))
           {:users {:allow {:$default "false"}}}
           #{}

           {:$default {:allow {:view "false"}}}
           #{}

           {:$default {:allow {:$default "false"}}}
           #{}

           {:users {:allow {:$default "false" :view "true"}}}
           #{"alex" "joe" "stopa" "nicolegf"}

           {:$default {:allow {:view "false"}} :users {:allow {:view "true"}}}
           #{"alex" "joe" "stopa" "nicolegf"}

           {:$default {:allow {:$default "false"}} :users {:allow {:view "true"}}}
           #{"alex" "joe" "stopa" "nicolegf"}

           {:$default {:allow {:$default "false"}} :users {:allow {:$default "true"}}}
           #{"alex" "joe" "stopa" "nicolegf"}

           {:$default {:allow {:view "false"}} :users {:allow {:$default "true"}}}
           #{"alex" "joe" "stopa" "nicolegf"}

           {:$default {:allow {:$default "false" :view "true"}}}
           #{"alex" "joe" "stopa" "nicolegf"}))))))

(deftest read-perms
  (doseq [[app-fn description] [[with-zeneca-app "without checked attrs"]
                                [with-zeneca-checked-data-app "with checked attrs"]]]
    (testing description
      (app-fn
       (fn [{app-id :id :as _app} _r]
         (testing "no perms returns full"
           (rule-model/put!
            (aurora/conn-pool)
            {:app-id app-id :code {}})
           (is
            (= #{"alex" "joe" "stopa" "nicolegf"}
               (->>  (pretty-perm-q
                      {:app-id app-id :current-user nil}
                      {:users {}})
                     :users
                     (map :handle)
                     set))))
         (testing "false returns nothing"
           (rule-model/put!
            (aurora/conn-pool)
            {:app-id app-id :code {:users {:allow {:view "false"}}}})
           (is
            (empty?
             (->>  (pretty-perm-q
                    {:app-id app-id :current-user nil}
                    {:users {}})
                   :users
                   (map :handle)
                   set))))
         (testing "property equality"
           (rule-model/put!
            (aurora/conn-pool)
            {:app-id app-id :code {:users {:allow {:view "data.handle == 'stopa'"}}}})
           (is
            (=
             #{"stopa"}
             (->>  (pretty-perm-q
                    {:app-id app-id :current-user nil}
                    {:users {}})
                   :users
                   (map :handle)
                   set))))
         (testing "bind"
           (rule-model/put!
            (aurora/conn-pool)
            {:app-id app-id :code {:users {:allow {:view "data.handle != handle"}
                                           :bind ["handle" "'stopa'"]}}})
           (is
            (=
             #{"alex" "joe" "nicolegf"}
             (->>  (pretty-perm-q
                    {:app-id app-id :current-user nil}
                    {:users {}})
                   :users
                   (map :handle)
                   set))))
         (testing "ref"
           (rule-model/put!
            (aurora/conn-pool)
            {:app-id app-id :code {:bookshelves {:allow {:view "handle in data.ref('users.handle')"}
                                                 :bind ["handle" "'alex'"]}}})
           (is
            (=
             #{"Short Stories" "Nonfiction"}
             (->>  (pretty-perm-q
                    {:app-id app-id :current-user nil}
                    {:bookshelves {}})
                   :bookshelves
                   (map :name)
                   set))))
         (testing "auth required"
           (rule-model/put!
            (aurora/conn-pool)
            {:app-id app-id :code {:users {:allow {:view "auth.id != null"}}}})
           (is
            (empty?
             (->>  (pretty-perm-q
                    {:app-id app-id :current-user nil}
                    {:users {}})
                   :users
                   (map :handle)
                   set))))

         (testing "null shouldn't evaluate to true"
           (rule-model/put!
            (aurora/conn-pool)
            {:app-id app-id :code {:users {:allow {:view "auth.isAdmin"}}}})
           (is
            (empty?
             (->>  (pretty-perm-q
                    {:app-id app-id :current-user nil}
                    {:users {}})
                   :users
                   (map :handle)
                   set))))
         (testing "can only view authed user data"
           (rule-model/put!
            (aurora/conn-pool)
            {:app-id app-id :code {:users {:allow {:view "auth.handle == data.handle"}}}})
           (is
            (= #{"stopa"}
               (->>  (pretty-perm-q
                      {:app-id app-id :current-user {:handle "stopa"}}
                      {:users {}})
                     :users
                     (map :handle)
                     set))))

         (testing "page-info is filtered"
           (is
            (= {:start-cursor ["eid-stepan-parunashvili" :users/id "eid-stepan-parunashvili"],
                :end-cursor ["eid-stepan-parunashvili" :users/id "eid-stepan-parunashvili"]
                :has-next-page? false,
                :has-previous-page? false}
               (let [r (resolvers/make-zeneca-resolver app-id)]
                 (->> (iq/permissioned-query
                       {:db {:conn-pool (aurora/conn-pool)}
                        :app-id app-id
                        :attrs (attr-model/get-by-app-id app-id)
                        :datalog-query-fn d/query
                        :current-user {:handle "stopa"}}
                       {:users {:$ {:limit 10}}})
                      first
                      :data
                      :datalog-result
                      :page-info
                      (resolvers/walk-friendly r)
                      ;; remove timestamps
                      (#(update % :start-cursor drop-last))
                      (#(update % :end-cursor drop-last)))))))

         (testing "bad rules produce a permission evaluation exception"
           (rule-model/put!
            (aurora/conn-pool)
            {:app-id app-id :code {:users {:allow {:view "auth.handle in data.nonexistent"}}}})

           (is
            (= ::ex/permission-evaluation-failed
               (::ex/type (instant-ex-data
                           (pretty-perm-q
                            {:app-id app-id :current-user {:handle "stopa"}}
                            {:users {}})))))))))))

(deftest coarse-topics []
  (let [{:keys [patterns]}
        (iq/instaql-query->patterns
         @ctx
         {:users {:$ {:where {:handle {:in ["stopa" "joe"]}
                              :bookshelves.books.title "The Count of Monte Cristo"}}
                  :bookshelves {}}})]
    (is (= '[[:av _ #{:users/handle} #{"stopa" "joe"} _]
             [:eav _ #{:users/bookshelves} _ _]
             [:eav _ #{:bookshelves/books} _ _]
             [:ea _ #{:books/title} #{"The Count of Monte Cristo"} _]
             [:ea
              _
              #{:users/bookshelves
                :users/createdAt
                :users/email
                :users/id
                :users/fullName
                :users/handle}
              _
              _]
             [:eav _ #{:users/bookshelves} _ _]
             [:ea
              _
              #{:bookshelves/desc
                :bookshelves/name
                :bookshelves/order
                :bookshelves/id
                :bookshelves/books}
              _
              _]]
           (resolvers/walk-friendly
            @r
            (d/pats->coarse-topics patterns))))))

(deftest aggregates []
  (testing "simple query"
    (is-pretty-eq?
     (query-pretty
      (assoc @ctx :admin? true)
      {:users {:$ {:aggregate :count}}})
     '({:topics
        #{[:eav _ #{:users/id} _ _]},
        :triples #{}
        :aggregate [{:count 4}]})))

  (testing "multiple"
    (is-pretty-eq?
     (query-pretty
      (assoc @ctx :admin? true)
      {:users {:$ {:aggregate :count}}
       :books {:$ {:aggregate :count}}})
     '({:topics #{[:eav _ #{:users/id} _ _]
                  [:eav _ #{:books/id} _ _]}
        :triples #{}
        :aggregate [{:count 4}
                    {:count 392}]}))))

(deftest namespaces-that-share-eids []
  (with-empty-app
    (fn [app]
      (let [book-id-aid (random-uuid)
            book-field-aid (random-uuid)
            author-id-aid (random-uuid)
            author-field-aid (random-uuid)
            shared-eid (random-uuid)
            run-query (fn [{:keys [admin?]} q]
                        (let [ctx (let [attrs (attr-model/get-by-app-id (:id app))]
                                    {:db {:conn-pool (aurora/conn-pool)}
                                     :app-id (:id app)
                                     :attrs attrs
                                     :admin? admin?})
                              r (resolvers/make-resolver {:conn-pool (aurora/conn-pool)}
                                                         (:id app)
                                                         [["books" "field"]
                                                          ["authors" "field"]])]
                          (->> (iq/permissioned-query ctx q)
                               (instaql-nodes->object-tree ctx))))]
        (tx/transact! (aurora/conn-pool)
                      (attr-model/get-by-app-id (:id app))
                      (:id app)
                      [[:add-attr {:id book-id-aid
                                   :forward-identity [(random-uuid) "books" "id"]
                                   :unique? true
                                   :index? true
                                   :value-type :blob
                                   :cardinality :one}]
                       [:add-attr {:id book-field-aid
                                   :forward-identity [(random-uuid) "books" "field"]
                                   :unique? false
                                   :index? false
                                   :value-type :blob
                                   :cardinality :one}]
                       [:add-attr {:id author-id-aid
                                   :forward-identity [(random-uuid) "authors" "id"]
                                   :unique? true
                                   :index? true
                                   :value-type :blob
                                   :cardinality :one}]
                       [:add-attr {:id author-field-aid
                                   :forward-identity [(random-uuid) "authors" "field"]
                                   :unique? false
                                   :index? false
                                   :value-type :blob
                                   :cardinality :one}]
                       [:add-triple shared-eid book-id-aid (str shared-eid)]
                       [:add-triple shared-eid book-field-aid "book"]
                       [:add-triple shared-eid author-id-aid (str shared-eid)]
                       [:add-triple shared-eid author-field-aid "author"]])
        (rule-model/put! (aurora/conn-pool)
                         {:app-id (:id app) :code {:books {:allow {:view "false"}}
                                                   :authors {:allow {:view "true"}}}})
        (is (= {"books" [{"field" "book", "id" (str shared-eid)}]
                "authors" [{"field" "author", "id" (str shared-eid)}]}
               (run-query {:admin? true} {:books {} :authors {}})))

        (is (= {"books" []
                "authors" [{"field" "author", "id" (str shared-eid)}]}
               (run-query {:admin? false} {:books {} :authors {}})))))))

;; -----------
;; Users table

(deftest users-table-queries
  (with-empty-app
    (fn [app]
      (let [query-pretty' (fn [q]
                            (let [attrs (attr-model/get-by-app-id (:id app))]
                              (query-pretty {:db {:conn-pool (aurora/conn-pool)}
                                             :app-id (:id app)
                                             :attrs attrs}
                                            (resolvers/make-movies-resolver (:id app))
                                            q)))
            first-id (random-uuid)
            second-id (random-uuid)

            users [{:id first-id
                    :email "first@example.com"
                    :app-id (:id app)}
                   {:id second-id
                    :email "second@example.com"
                    :app-id (:id app)}]]
        (doseq [user users]
          (app-user-model/create! user))

        (is-pretty-eq?
         (query-pretty' {:$users {}})
         [{:topics
           [[:ea '_ #{:$users/id} '_]
            '--
            [:ea #{first-id} #{:$users/email :$users/id} '_]
            '--
            [:ea #{second-id} #{:$users/email :$users/id} '_]],
           :triples
           [[second-id :$users/id (str second-id)]
            [first-id :$users/id (str first-id)]
            '--
            [second-id :$users/email "second@example.com"]
            [second-id :$users/id (str second-id)]
            '--
            [first-id :$users/id (str first-id)]
            [first-id :$users/email "first@example.com"]]}])

        (is-pretty-eq?
         (query-pretty' {:$users {:$ {:where {:email "first@example.com"}}}})
         [{:topics
           [[:ave '_ #{:$users/email} #{"first@example.com"}]
            '--
            [:ea #{first-id} #{:$users/email :$users/id} '_]],
           :triples
           [[first-id :$users/id (str first-id)]
            '--
            [first-id :$users/id (str first-id)]
            [first-id :$users/email "first@example.com"]]}])))))

(deftest users-table-read-permissions
  (with-empty-app
    (fn [app]
      (let [make-ctx (fn []
                       (let [attrs (attr-model/get-by-app-id (:id app))]
                         {:db {:conn-pool (aurora/conn-pool)}
                          :app-id (:id app)
                          :attrs attrs}))
            first-id (random-uuid)
            second-id (random-uuid)

            users [{:id first-id
                    :email "first@example.com"
                    :app-id (:id app)}
                   {:id second-id
                    :email "second@example.com"
                    :app-id (:id app)}]]
        (doseq [user users]
          (app-user-model/create! user))

        (testing "default rules let you see no users without auth"
          (is (= (pretty-perm-q (make-ctx) {:$users {}})
                 {:$users []})))

        (testing "default rules let you view yourself"
          (is (= (pretty-perm-q (assoc (make-ctx)
                                       :current-user (first users))
                                {:$users {}})
                 {:$users [{:email (:email (first users))
                            :id (str (:id (first users)))}]})))))))

(deftest users-table-references
  (with-zeneca-app
    (fn [app r0]
      (let [make-ctx (fn []
                       (let [attrs (attr-model/get-by-app-id (:id app))]
                         {:db {:conn-pool (aurora/conn-pool)}
                          :app-id (:id app)
                          :attrs attrs}))

            attr-id (random-uuid)
            _ (tx/transact! (aurora/conn-pool)
                            (attr-model/get-by-app-id (:id app))
                            (:id app)
                            [[:add-attr {:id attr-id
                                         :forward-identity [(random-uuid) "books" "$user-creator"]
                                         :reverse-identity [(random-uuid) "$users" "books"]
                                         :unique? false
                                         :index? false
                                         :value-type :ref
                                         :cardinality :one}]
                             [:add-triple
                              (resolvers/->uuid r0 "eid-sum")
                              attr-id
                              (str (resolvers/->uuid r0 "eid-alex"))]])
            r1 (resolvers/make-zeneca-resolver (:id app))]

        (testing "forward reference"
          (is-pretty-eq?
           (query-pretty (make-ctx)
                         r1
                         {:books {:$ {:where {"$user-creator.email" "alex@instantdb.com"}}}})
           [{:topics
             [[:ave '_ #{:$users/email} #{"alex@instantdb.com"}]
              [:vae '_ #{:books/$user-creator} #{"eid-alex"}]
              '--
              [:ea
               #{"eid-sum"}
               #{:books/pageCount
                 :books/$user-creator
                 :books/isbn13
                 :books/description
                 :books/id
                 :books/thumbnail
                 :books/title}
               '_]],
             :triples
             [["eid-sum" :books/$user-creator "eid-alex"]
              ["eid-alex" :$users/email "alex@instantdb.com"]
              '--
              ["eid-sum" :books/pageCount 107]
              ["eid-sum"
               :books/thumbnail
               "http://books.google.com/books/content?id=-cjWiI8DEywC&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api"]
              ["eid-sum" :books/$user-creator "eid-alex"]
              ["eid-sum" :books/title "Sum"]
              ["eid-sum" :books/id "eid-sum"]
              ["eid-sum"
               :books/description
               "At once funny, wistful and unsettling, Sum is a dazzling exploration of unexpected afterlives—each presented as a vignette that offers a stunning lens through which to see ourselves in the here and now. In one afterlife, you may find that God is the size of a microbe and unaware of your existence. In another version, you work as a background character in other people’s dreams. Or you may find that God is a married couple, or that the universe is running backward, or that you are forced to live out your afterlife with annoying versions of who you could have been. With a probing imagination and deep understanding of the human condition, acclaimed neuroscientist David Eagleman offers wonderfully imagined tales that shine a brilliant light on the here and now. From the Trade Paperback edition."]]}]))

        (testing "reverse reference"
          (is-pretty-eq?
           (query-pretty (make-ctx)
                         r1
                         {:$users {:$ {:where {"books.title" "Sum"}}}})
           [{:topics
             [[:ave '_ #{:books/title} #{"Sum"}]
              [:eav #{"eid-sum"} #{:books/$user-creator} '_]
              '--
              [:ea #{"eid-alex"} #{:$users/email :$users/id} '_]],
             :triples
             [["eid-sum" :books/$user-creator "eid-alex"]
              ["eid-sum" :books/title "Sum"]
              '--
              ["eid-alex" :$users/id "eid-alex"]
              ["eid-alex" :$users/email "alex@instantdb.com"]]}]))))))

(deftest users-table-perms-with-references
  (with-zeneca-app
    (fn [app r0]
      (let [make-ctx (fn []
                       (let [attrs (attr-model/get-by-app-id (:id app))]
                         {:db {:conn-pool (aurora/conn-pool)}
                          :app-id (:id app)
                          :attrs attrs}))

            attr-id (random-uuid)
            _ (tx/transact! (aurora/conn-pool)
                            (attr-model/get-by-app-id (:id app))
                            (:id app)
                            [[:add-attr {:id attr-id
                                         :forward-identity [(random-uuid) "books" "$user-creator"]
                                         :reverse-identity [(random-uuid) "$users" "books"]
                                         :unique? false
                                         :index? false
                                         :value-type :ref
                                         :cardinality :one}]
                             [:add-triple
                              (resolvers/->uuid r0 "eid-sum")
                              attr-id
                              (str (resolvers/->uuid r0 "eid-alex"))]])
            r1 (resolvers/make-zeneca-resolver (:id app))]

        (testing "forward reference"
          (is (= (-> (pretty-perm-q (assoc (make-ctx)
                                           :current-user {:id (resolvers/->uuid r1 "eid-mark")})
                                    {:books {:$ {:where {"$user-creator.email" "alex@instantdb.com"}}}})
                     :books)
                 []))

          (is (= (-> (pretty-perm-q (assoc (make-ctx)
                                           :current-user {:id (resolvers/->uuid r1 "eid-alex")})
                                    {:books {:$ {:where {"$user-creator.email" "alex@instantdb.com"}}}})
                     :books
                     (#(map :title %)))
                 ["Sum"])))

        (testing "reverse reference"
          (is (= (-> (pretty-perm-q (assoc (make-ctx)
                                           :current-user {:id (resolvers/->uuid r1 "eid-mark")})
                                    {:$users {:$ {:where {"books.title" "Sum"}}}})
                     :$users)
                 []))

          (is (= (-> (pretty-perm-q (assoc (make-ctx)
                                           :current-user {:id (resolvers/->uuid r1 "eid-alex")})
                                    {:$users {:$ {:where {"books.title" "Sum"}}}})
                     :$users
                     (#(map :email %)))
                 ["alex@instantdb.com"])))))))

(deftest auth-ref-perms
  (with-zeneca-app
    (fn [app r0]
      (let [make-ctx (fn []
                       (let [attrs (attr-model/get-by-app-id (:id app))]
                         {:db {:conn-pool (aurora/conn-pool)}
                          :app-id (:id app)
                          :attrs attrs}))

            attr-id (random-uuid)
            _ (tx/transact! (aurora/conn-pool)
                            (attr-model/get-by-app-id (:id app))
                            (:id app)
                            [[:add-attr {:id attr-id
                                         :forward-identity [(random-uuid) "books" "$user-creator"]
                                         :reverse-identity [(random-uuid) "$users" "books"]
                                         :unique? false
                                         :index? false
                                         :value-type :ref
                                         :cardinality :one}]
                             [:add-triple
                              (resolvers/->uuid r0 "eid-sum")
                              attr-id
                              (str (resolvers/->uuid r0 "eid-alex"))]])
            r1 (resolvers/make-zeneca-resolver (:id app))]

        (rule-model/put!
         (aurora/conn-pool)
         {:app-id (:id app) :code {:books {:allow {:view "'Sum' in auth.ref('$user.books.title')"}}}})

        (is (= (-> (pretty-perm-q (assoc (make-ctx)
                                         :current-user {:id (resolvers/->uuid r1 "eid-alex")})
                                  {:books {:$ {:where {"$user-creator.email" "alex@instantdb.com"}}}})
                   :books
                   (#(map :title %)))
               ["Sum"]))

        (is (= (-> (pretty-perm-q (assoc (make-ctx)
                                         :current-user {:id (resolvers/->uuid r1 "eid-mark")})
                                  {:books {}})
                   :books)
               []))))))

(deftest ordering-with-where-and-limit
  (with-empty-app
    (fn [{app-id :id :as _app}]
      (let [make-ctx (fn []
                       (let [attrs (attr-model/get-by-app-id app-id)]
                         {:db {:conn-pool (aurora/conn-pool)}
                          :app-id app-id
                          :attrs attrs}))

            ;; Create conversations, messages
            convo-id-aid (random-uuid)
            group-id-aid (random-uuid)
            convo-group-aid (random-uuid)
            msg-id-aid (random-uuid)
            msg-time-aid (random-uuid)
            msg-convos-id (random-uuid)
            _ (tx/transact! (aurora/conn-pool)
                            (attr-model/get-by-app-id app-id)
                            app-id
                            [[:add-attr {:id group-id-aid
                                         :forward-identity [(random-uuid) "groups" "id"]
                                         :unique? true
                                         :index? true
                                         :value-type :blob
                                         :cardinality :one}]
                             [:add-attr {:id convo-id-aid
                                         :forward-identity [(random-uuid) "conversations" "id"]
                                         :unique? true
                                         :index? true
                                         :value-type :blob
                                         :cardinality :one}]
                             [:add-attr {:id convo-group-aid
                                         :forward-identity [(random-uuid) "conversations" "groups"]
                                         :reverse-identity [(random-uuid) "groups" "conversations"]
                                         :unique? false
                                         :index? false
                                         :value-type :ref
                                         :cardinality :one}]
                             [:add-attr {:id msg-id-aid
                                         :forward-identity [(random-uuid) "messages" "id"]
                                         :unique? true
                                         :index? true
                                         :value-type :blob
                                         :cardinality :one}]
                             [:add-attr {:id msg-time-aid
                                         :forward-identity [(random-uuid) "messages" "time"]
                                         :unique? false
                                         :index? true
                                         :checked-data-type :number
                                         :value-type :blob
                                         :cardinality :one}]
                             [:add-attr {:id msg-convos-id
                                         :forward-identity [(random-uuid) "messages" "conversation"]
                                         :reverse-identity [(random-uuid) "conversations" "messages"]
                                         :unique? false
                                         :index? false
                                         :value-type :ref
                                         :cardinality :one}]])

            ;; add 1 group, 3 conversations, with 5 messages each
            add-conversation (fn [g-id c-id]
                               [[:add-triple c-id convo-id-aid (str c-id)]
                                [:add-triple c-id convo-group-aid (str g-id)]])

            add-message (fn [convo-id m-id t]
                          [[:add-triple m-id msg-id-aid m-id]
                           [:add-triple m-id msg-time-aid t]
                           [:add-triple m-id msg-convos-id convo-id]])

            convo-msg-data (->> (repeatedly 3 random-uuid)
                                (map-indexed (fn [idx c-id]
                                               {:convo-id c-id
                                                :convo-idx idx
                                                :messages (map-indexed
                                                           (fn [i m-id]
                                                             {:msg-id m-id
                                                              :msg-idx i})
                                                           (repeatedly 20 random-uuid))})))

            group-id (random-uuid)
            steps-of-steps (map
                            (fn [{:keys [convo-id convo-idx messages]}]
                              (concat (add-conversation group-id convo-id)
                                      (mapcat (fn [{:keys [msg-id msg-idx]}]
                                                (add-message convo-id msg-id (+ convo-idx msg-idx)))
                                              messages)))

                            convo-msg-data)
            _ (mapv
               (fn [steps]
                 (tx/transact! (aurora/conn-pool)
                               (attr-model/get-by-app-id app-id)
                               app-id
                               steps))

               steps-of-steps)

            ctx (make-ctx)]
        (is (= 3
               (-> (instaql-nodes->object-tree
                    ctx
                    (iq/query ctx
                              {:conversations {:$ {:where {:messages.time {:$gte 0}}}}}))
                   (get "conversations")
                   count)))

        (is (= 2
               (-> (instaql-nodes->object-tree
                    ctx
                    (iq/query ctx
                              {:conversations {:$ {:limit 2
                                                   :where {:messages.time {:$gte 0}}}}}))
                   (get "conversations")
                   count)))

        (is (= 2
               (-> (instaql-nodes->object-tree
                    ctx
                    (iq/query ctx
                              {:conversations {:$ {:limit 2
                                                   :where {:groups group-id
                                                           :messages.time {:$gte 0}}}}}))
                   (get "conversations")
                   count)))))))

(comment
  (test/run-tests *ns*))
