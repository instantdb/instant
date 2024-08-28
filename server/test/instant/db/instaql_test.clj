(ns instant.db.instaql-test
  (:require [clojure.test :as test :refer [deftest is testing]]
            [instant.jdbc.aurora :as aurora]
            [instant.data.constants :refer [zeneca-app-id]]
            [instant.data.resolvers :as resolvers]
            [instant.fixtures :refer [with-zeneca-app with-zeneca-byop]]
            [instant.db.instaql :as iq]
            [instant.db.model.attr :as attr-model] 
            [instant.model.rule :as rule-model]
            [instant.db.datalog :as d]
            [instant.admin.routes :as admin-routes]
            [instant.model.app :as app-model]
            [instant.data.bootstrap :as bootstrap]
            [instant.reactive.query :refer [collect-instaql-results-for-client]]
            [instant.util.exception :as ex]
            [instant.util.test :refer [instant-ex-data pretty-perm-q]])
  (:import
   (java.util UUID)))

(def ^:private r (delay (resolvers/make-zeneca-resolver)))

(def ^:private ctx
  (delay {:db {:conn-pool aurora/conn-pool}
          :app-id zeneca-app-id
          :attrs (attr-model/get-by-app-id aurora/conn-pool zeneca-app-id)}))

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

(defn- is-pretty-eq?
  "InstaQL will execute in parallel.

   This means that it _is_ possible for nodes
   to come in different order.

   For example:
    for each user, get their bookshelves.

   Bookshelf queries could be executed in any order.

   This checks equality strictly based on
   the set of topics and triples in the result"
  [pretty-a pretty-b]
  (is (= (set (mapcat :topics pretty-a))
         (set (mapcat :topics pretty-b))))
  (is (= (set (mapcat :triples pretty-a))
         (set (mapcat :triples pretty-b))))
  (is (= (set (remove nil? (mapcat :aggregate pretty-a)))
         (set (remove nil? (mapcat :aggregate pretty-b))))))

(defn- query-pretty
  ([q]
   (query-pretty @ctx q))
  ([ctx q]
   (->> q
        (iq/query ctx)
        (resolvers/walk-friendly @r)
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
    (is (= '{:expected instant.db.instaql/where-value-valid-keys?,
             :in [0 :option-map :where-conds 0 1]}
           (validation-err {:users
                            {:$ {:where {:bookshelves {:books.title "The Count of Monte Cristo"}}}}}))))
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
    (is (= '{:expected valid-order?
             :in ["users" :$ :order "random-field"],
             :message
             "We currently only support \"serverCreatedAt\" as the sort key in the `order` clause. Got \"random-field\"."}
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

(deftest pagination
  (testing "limit"
    (is-pretty-eq? (query-pretty {:users {:$ {:limit 2
                                              :order {:serverCreatedAt :desc}}}})
                   '({:topics #{[:eav _ #{:users/id} _]
                                --
                                [:ea #{"eid-alex"} _ _]
                                [:ea #{"eid-joe-averbukh"} _ _]
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
                                [:ea #{"eid-stepan-parunashvili"} _ _]
                                --
                                [:av _ #{:users/handle} #{"stopa" "joe" "nicolegf"}]
                                [:ea #{"eid-joe-averbukh"} _ _]}
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
    (is-pretty-eq? (query-pretty {:users {:$ {:offset 2
                                              :order {:serverCreatedAt :desc}}}})
                   '({:topics #{[:eav _ #{:users/id} _]
                                [:ea #{"eid-stepan-parunashvili"} _ _]
                                [:ea #{"eid-nicole"} _ _]
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
                                    [:ea #{"eid-alex"} _ _]
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
                                    [:ea #{"eid-nicole"} _ _]
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
                                    [:ea #{"eid-alex"} _ _]
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
                          (as-> (admin-routes/instaql-nodes->object-tree
                                 (:attrs @ctx)
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
         [:ea #{"eid-stepan-parunashvili"} _ _]
         --
         [:ea #{"eid-nicole"} _ _]
         --
         [:ea #{"eid-joe-averbukh"} _ _]
         --
         [:ea #{"eid-alex"} _ _]),
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
         [:ea #{"eid-alex"} _ _]),
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
         [:ea #{"eid-alex"} _ _]),
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
         [:ea #{"eid-stepan-parunashvili"} _ _]),
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
    (is-pretty-eq?
     (query-pretty
      {:users
       {:$ {:where {:bookshelves.books.id (resolvers/->uuid @r "eid-musashi")}}}})
     '({:topics
        ([:av _ #{:books/id} #{"eid-musashi"}]
         [:vae _ #{:bookshelves/books} #{"eid-musashi"}]
         [:vae _ #{:users/bookshelves} #{"eid-the-way-of-the-gentleman"}]
         --
         [:ea #{"eid-stepan-parunashvili"} _ _]),
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
         ["eid-stepan-parunashvili" :users/id "eid-stepan-parunashvili"])}))))

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
         [:ea #{"eid-stepan-parunashvili"} _ _]),
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
         [:ea #{"eid-alex"} _ _]
         --
         [:eav #{"eid-alex"} #{:users/bookshelves} _]
         [:ea _ #{:bookshelves/name} #{"Nonfiction"}]
         [:ea #{"eid-nonfiction"} #{:bookshelves/order} #{1}]
         --
         [:ea #{"eid-nonfiction"} _ _]),
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
                 [:ea #{"eid-stepan-parunashvili"} _ _]
                 --
                 [:ea #{"eid-joe-averbukh"} _ _]),
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
                 [:ea #{"eid-stepan-parunashvili"} _ _]
                 --
                 [:ea #{"eid-joe-averbukh"} _ _]),
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
                 [:ea #{"eid-joe-averbukh"} _ _]),
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
     '({:topics ([:ea _ #{:books/title} #{"The Count of Monte Cristo"}]
                 [:vae _ #{:bookshelves/books} #{"eid-the-count-of-monte-cristo"}]
                 [:vae _ #{:users/bookshelves} #{"eid-the-way-of-the-gentleman"}]
                 [:ea _ #{:books/title} #{"Musashi"}]
                 [:vae _ #{:bookshelves/books} #{"eid-musashi"}]
                 [:vae
                  #{"eid-stepan-parunashvili"}
                  #{:users/bookshelves}
                  #{"eid-the-way-of-the-gentleman"}]
                 [:av
                  #{"eid-stepan-parunashvili"}
                  #{:users/email}
                  #{"stopa@instantdb.com"}]
                 [:av #{"eid-stepan-parunashvili"} #{:users/handle} #{"stopa"}]
                 --
                 [:ea #{"eid-stepan-parunashvili"} _ _]),
        :triples (("eid-the-count-of-monte-cristo"
                   :books/title
                   "The Count of Monte Cristo")
                  ("eid-the-count-of-monte-cristo"
                   :books/title
                   "The Count of Monte Cristo")
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
                  ("eid-stepan-parunashvili" :users/email "stopa@instantdb.com")
                  --
                  ("eid-stepan-parunashvili"
                   :users/createdAt
                   "2021-01-07 18:50:43.447955")
                  ("eid-stepan-parunashvili" :users/fullName "Stepan Parunashvili")
                  ("eid-stepan-parunashvili" :users/handle "stopa")
                  ("eid-stepan-parunashvili" :users/email "stopa@instantdb.com")
                  ("eid-stepan-parunashvili" :users/id "eid-stepan-parunashvili"))}))))

(deftest where-and
  (testing "with no matches"
    (is-pretty-eq?
     (query-pretty
      {:users {:$ {:where {:and [{:handle {:in ["nobody"]}}
                                 {:handle "everybody"}]}}}})
     '({:topics
        ([:av _ #{:users/handle} #{"nobody"}]
         [:av _ #{:users/handle} #{"everybody"}]),
        :triples ()})))

  (testing "with matches"
    (let [expected '({:topics ([:ea #{"eid-stepan-parunashvili"} _ _]
                               [:ea _ #{:books/title} #{"Musashi"}]
                               [:vae _ #{:bookshelves/books} #{"eid-the-count-of-monte-cristo"}]
                               --
                               [:ea _ #{:books/title} #{"The Count of Monte Cristo"}]
                               [:vae
                                #{"eid-stepan-parunashvili"}
                                #{:users/bookshelves}
                                #{"eid-the-way-of-the-gentleman"}]
                               [:vae _ #{:bookshelves/books} #{"eid-musashi"}]
                               [:vae _ #{:users/bookshelves} #{"eid-the-way-of-the-gentleman"}]),
                      :triples (("eid-stepan-parunashvili" :users/email "stopa@instantdb.com")
                                ("eid-stepan-parunashvili"
                                 :users/createdAt
                                 "2021-01-07 18:50:43.447955")
                                --
                                ("eid-stepan-parunashvili" :users/fullName "Stepan Parunashvili")
                                ("eid-stepan-parunashvili" :users/id "eid-stepan-parunashvili")
                                ("eid-musashi" :books/title "Musashi")
                                ("eid-the-count-of-monte-cristo"
                                 :books/title
                                 "The Count of Monte Cristo")
                                ("eid-stepan-parunashvili" :users/handle "stopa")
                                ("eid-the-way-of-the-gentleman" :bookshelves/books "eid-musashi")
                                ("eid-stepan-parunashvili"
                                 :users/bookshelves
                                 "eid-the-way-of-the-gentleman")
                                ("eid-the-way-of-the-gentleman"
                                 :bookshelves/books
                                 "eid-the-count-of-monte-cristo"))})]
      (is-pretty-eq?
       (query-pretty
        {:users {:$ {:where {:and [{:bookshelves.books.title "Musashi"}
                                   {:bookshelves.books.title "The Count of Monte Cristo"}]}}}})
       expected)

      (is-pretty-eq?
       (query-pretty
        {:users {:$ {:where {:bookshelves.books.title "Musashi"
                             :and [{:bookshelves.books.title "The Count of Monte Cristo"}]}}}})
       expected)))

  (testing "with nested ors"
    (is-pretty-eq?
     (query-pretty
      {:users {:$ {:where {:and [{:or [{:handle "somebody"}
                                       {:handle "joe"}
                                       {:handle "nobody"}
                                       {:handle "stopa"}
                                       {:and [{:or [{:handle "stopa"}]}]}]}]}}}})
     '({:topics ([:ea #{"eid-stepan-parunashvili"} _ _]
                 [:av _ #{:users/handle} #{"stopa"}]
                 [:av _ #{:users/handle} #{"somebody"}]
                 --
                 [:av _ #{:users/handle} #{"joe"}]
                 [:ea #{"eid-joe-averbukh"} _ _]
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

(deftest child-forms
  (testing "no child where"
    (is-pretty-eq?
     (query-pretty
      {:users {:$ {:where {:handle "alex"}},
               :bookshelves {}}})
     '({:topics
        ([:av _ #{:users/handle} #{"alex"}]
         --
         [:ea #{"eid-alex"} _ _]
         --
         [:eav #{"eid-alex"} #{:users/bookshelves} _]
         --
         [:ea #{"eid-short-stories"} _ _]
         --
         [:ea #{"eid-nonfiction"} _ _]),
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
         [:ea #{"eid-nonfiction"} _ _]
         --
         [:vae _ #{:users/bookshelves} #{"eid-nonfiction"}]
         --
         [:ea #{"eid-alex"} _ _]),
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
         [:ea #{"eid-alex"} _ _]
         --
         [:eav #{"eid-alex"} #{:users/bookshelves} _]
         [:ea _ #{:bookshelves/name} #{"Nonfiction"}]
         --
         [:ea #{"eid-nonfiction"} _ _]),
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
         [:ea #{"eid-alex"} _ _]
         --
         [:eav #{"eid-alex"} #{:users/bookshelves} _]
         [:ea _ #{:bookshelves/name} #{"Nonfiction"}]
         [:ea _ #{:bookshelves/name} #{"Fiction"}]
         --
         [:ea #{"eid-nonfiction"} _ _]),
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
        ([:ea #{"eid-nonfiction"} _ _]
         [:eav #{"eid-alex"} #{:users/bookshelves} _]
         [:ea _ #{:bookshelves/name} #{"Nonfiction"}]
         --
         [:ea #{"eid-alex"} _ _]
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
         [:ea #{"eid-stepan-parunashvili"} _ _]
         --
         [:ea _ _ _]
         [:eav _ _ _]
         --
         [:ea #{"eid-nicole"} _ _]
         --
         [:ea _ _ _]
         [:eav _ _ _]
         --
         [:ea #{"eid-joe-averbukh"} _ _]
         --
         [:ea _ _ _]
         [:eav _ _ _]
         --
         [:ea #{"eid-alex"} _ _]
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

;; ------ 
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

(deftest read-perms
  (with-zeneca-app
    (fn [{app-id :id :as _app} _r]
      (testing "no perms returns full"
        (rule-model/put!
         aurora/conn-pool
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
         aurora/conn-pool
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
         aurora/conn-pool
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
         aurora/conn-pool
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
         aurora/conn-pool
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
         aurora/conn-pool
         {:app-id app-id :code {:users {:allow {:view "auth.id != null"}}}})
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
         aurora/conn-pool
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
                    {:db {:conn-pool aurora/conn-pool}
                     :app-id app-id
                     :attrs (attr-model/get-by-app-id aurora/conn-pool app-id)
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
         aurora/conn-pool
         {:app-id app-id :code {:users {:allow {:view "auth.handle in data.nonexistent"}}}})

        (is
         (= ::ex/permission-evaluation-failed
            (::ex/type (instant-ex-data
                         (pretty-perm-q
                          {:app-id app-id :current-user {:handle "stopa"}}
                          {:users {}})))))))))

(deftest coarse-topics []
  (let [{:keys [patterns]}
        (iq/instaql-query->patterns
         @ctx
         {:users {:$ {:where {:handle {:in ["stopa" "joe"]}
                              :bookshelves.books.title "The Count of Monte Cristo"}}
                  :bookshelves {}}})]
    (is (= '[[:av _ #{:users/handle} #{"stopa" "joe"} _]
             [:ea _ #{:books/title} #{"The Count of Monte Cristo"} _]
             [:vae _ #{:bookshelves/books} _ _]
             [:vae _ #{:users/bookshelves} _ _]
             [:ea _ _ _ _]
             [:eav _ #{:users/bookshelves} _ _]
             [:ea _ _ _ _]]
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

(comment
  (test/run-tests *ns*))
