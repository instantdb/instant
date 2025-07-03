(ns instant.db.datalog-test
  (:require [clojure.test :as test :refer [deftest is testing]]
            [honey.sql :as hsql]
            [instant.jdbc.aurora :as aurora]
            [instant.config :as config]
            [instant.db.datalog :as d]
            [instant.db.model.attr :as attr-model]
            [instant.data.resolvers :as resolvers]
            [instant.jdbc.sql :as sql]
            [instant.fixtures :refer [with-movies-app with-zeneca-app]]))

(defn make-ctx [app]
  {:db {:conn-pool (aurora/conn-pool :read)}
   :app-id (:id app)
   :attrs (attr-model/get-by-app-id (:id app))})

(defn- drop-join-rows-created-at [datalog-result]
  (update datalog-result :join-rows
          #(set (map (fn [row]
                       (vec (map (fn [subrow]
                                   (butlast subrow))
                                 row)))
                     %))))
(defn- query-pretty
  "Unwraps single element sets and prints friendly names for uuids"
  [ctx r q]
  (let [res (resolvers/walk-friendly
             r
             (d/query ctx q))]
    (drop-join-rows-created-at res)))

(deftest patterns
  (testing "named patterns are verbose raw patterns"
    (is (= '([:pattern {:idx [:keyword :eav], :e [:variable ?a], :a [:variable ?b], :v [:variable ?c] :created-at [:any _]}]
             [:pattern {:idx [:keyword :ea], :e [:variable ?c], :a [:variable ?d], :v [:variable ?e] :created-at [:any _]}])
           (d/->named-patterns '[[:eav ?a ?b ?c] [:ea ?c ?d ?e]]))))
  (testing "named patterns coerce values into sets"
    (is (= '([:pattern {:idx [:keyword :av], :e [:any _], :a [:variable ?a], :v [:constant #{5}] :created-at [:any _]}])
           (d/->named-patterns '[[:av _ ?a 5]]))))
  (testing "named patterns add wildcards for missing params"
    (is (= '([:pattern {:idx [:keyword :vae], :e [:any _], :a [:any _], :v [:any _] :created-at [:any _]}])
           (d/->named-patterns '[[:vae]])))))

(deftest pats->coarse-topics
  (is (= '[[:eav _ _ _ _]]
         (d/pats->coarse-topics '[[:eav ?e]])))
  (is (= '[[:eav _ _ #{"Joe"} _]]
         (d/pats->coarse-topics '[[:eav ?e ?a "Joe"]])))
  (is (= '[[:eav _ _ #{"Jack"} _]
           [:eav _ _ #{"Jill"} _]]
         (d/pats->coarse-topics '[{:or {:patterns [{:and [[:eav ?e ?a "Jack"]]}]}}
                                  [:eav ?e ?a "Jill"]])))
  (is (= '[[:eav _ _ #{"Jack"} _]
           [:eav _ _ #{"Jill"} _]]
         (d/pats->coarse-topics '{:children {:pattern-groups
                                             [{:patterns [{:or {:patterns [{:and [[:eav ?e ?a "Jack"]]}]}}
                                                          [:eav ?e ?a "Jill"]]}]}})))
  (is (= '[[:eav _ _ #{"Jack"} _]
           [:eav _ _ #{"Jill"} _]
           [:ea _ _ _ _]]
         (d/pats->coarse-topics '{:children {:pattern-groups
                                             [{:patterns [{:or {:patterns [{:and [[:eav ?e ?a "Jack"]]}]}}
                                                          [:eav ?e ?a "Jill"]]
                                               :children {:pattern-groups [{:patterns [[:ea ?e]]}],
                                                          :join-sym ?e}}]}}))))

(defn- raw-pats->join-conds [raw-pats]
  (let [named-ps (map second (d/->named-patterns raw-pats))]
    (-> (reduce (fn [{:keys [i symbol-map] :as acc} pat]
                  (-> acc
                      (update :join-conds conj (d/join-conds :match- 0 symbol-map pat))
                      (update :symbol-map (partial merge-with into) (d/symbol-map-of-pattern i pat))
                      (update :i inc)))
                {:join-conds []
                 :i 1
                 :symbol-map (d/symbol-map-of-pattern 0 (first named-ps))}
                (rest named-ps))
        :join-conds)))

(deftest joins
  (testing "join conditions bind symbols to the matching previous patterns"
    (is (=
         '(([:= :entity-id [:json_uuid_to_uuid :match-0-value]])
           ([:= :entity-id :match-0-attr-id]
            [:= :attr-id [:json_uuid_to_uuid :match-0-value]]
            [:= :attr-id :match-1-entity-id]))
         (raw-pats->join-conds '[[:vae ?a ?b ?c]
                                 [:ea ?c ?d ?e]
                                 [:ea ?b ?c]]))))
  (testing "join conditions match values"
    (is (= '(([:= :value :match-0-value]))
           (raw-pats->join-conds
            '[[:eav _ _ ?a]
              [:av _ _ ?a]]))))
  (testing "join conditions matches values to coerced entities"
    (is (= '(([:= [:json_uuid_to_uuid :value] :match-0-entity-id]))
           (raw-pats->join-conds '[[:ea ?a] [:vae _ _ ?a]]))))
  (testing "join conditions matches entities to attrs"
    (is (= '(([:= :entity-id :match-0-attr-id]))
           (raw-pats->join-conds '[[:av _ ?a] [:ea ?a]]))))
  (testing "join conditions matches attrs to entities"
    (is (= '(([:= :attr-id :match-0-entity-id]))
           (raw-pats->join-conds '[[:ea ?a] [:av _ ?a]])))))

(deftest validations
  (with-movies-app
    (fn [{app-id :id} _]
      (testing "throws on incorrect types"
        (doseq [bad-pat '[[:bad-idx ?e ?a ?]
                          [:ea "bad-e" ?a ?v]
                          [:ea ?e "bad-a" ?v]]]

          (is
           (thrown-with-msg?
            clojure.lang.ExceptionInfo
            #"Invalid input"
            (d/query
             {:db {:conn-pool (aurora/conn-pool :read)}
              :app-id app-id}
             [bad-pat])))))
      (testing "throws on unjoinable patterns"
        (is
         (thrown-with-msg?
          java.lang.AssertionError
          #"Pattern is not joinable"
          (d/query
           {:db {:conn-pool (aurora/conn-pool :read)}
            :app-id app-id}
           '[[:ea ?a ?b ?c]
             [:ea ?d ?e ?f]])))))))

(deftest coercions
  (with-movies-app
    (fn [app r]
      (let [tina-turner-eid (resolvers/->uuid r "eid-tina-turner")]
        (testing "query pads with _"
          (is (= #{"Tina Turner"
                   "1939-11-26T00:00:00Z"
                   (str tina-turner-eid)}
                 (->> (d/query
                       {:db {:conn-pool (aurora/conn-pool :read)}
                        :app-id (:id app)}
                       [[:ea tina-turner-eid]])
                      :join-rows
                      (map (comp last drop-last last))
                      set))))
        (testing "ref values come back as uuids"
          (let [vs (->> (d/query
                         {:db {:conn-pool (aurora/conn-pool :read)}
                          :app-id (:id app)}
                         [[:eav '?e '?a tina-turner-eid]])
                        :join-rows
                        (map (comp last drop-last last)))]
            (is (seq vs))
            (is (every? uuid? vs))))))))

(deftest batching-queries
  (with-movies-app
    (fn [app r]
      (let [app-id (:id app)
            ctx {:db {:conn-pool (aurora/conn-pool :read)}
                 :app-id app-id}
            movie-title-aid (resolvers/->uuid r :movie/title)
            movie-director-aid (resolvers/->uuid r :movie/director)
            person-name-aid (resolvers/->uuid r :person/name)
            patterns-1 [[:ea '?e movie-title-aid "Predator"]
                        [:vae '?e movie-director-aid '?director]
                        [:ea '?director person-name-aid '?name]]

            patterns-2 [[:ea '?director person-name-aid "John McTiernan"]
                        [:vae '?movie movie-director-aid '?director]
                        [:ea '?movie movie-title-aid '?title]]

            named-ps-1 (d/->named-patterns patterns-1)

            named-ps-2 (d/->named-patterns patterns-2)]

        (testing "send-query-single"
          (is (= #{[["eid-predator" :movie/title "Predator"]
                    ["eid-predator" :movie/director "eid-john-mctiernan"]
                    ["eid-john-mctiernan"
                     :person/name
                     "John McTiernan"]]}
                 (-> (resolvers/walk-friendly
                      r
                      (:join-rows (drop-join-rows-created-at
                                   (d/send-query-single ctx
                                                        (aurora/conn-pool :read)
                                                        app-id
                                                        named-ps-1)))))))
          (is (= #{[["eid-john-mctiernan" :person/name "John McTiernan"]
                    ["eid-die-hard" :movie/director "eid-john-mctiernan"]
                    ["eid-die-hard" :movie/title "Die Hard"]]
                   [["eid-john-mctiernan" :person/name "John McTiernan"]
                    ["eid-predator" :movie/director "eid-john-mctiernan"]
                    ["eid-predator" :movie/title "Predator"]]}
                 (resolvers/walk-friendly
                  r
                  (:join-rows (drop-join-rows-created-at
                               (d/send-query-single ctx (aurora/conn-pool :read) app-id named-ps-2)))))))
        (testing "send-query-batched"
          (is (= [#{[["eid-predator" :movie/title "Predator"]
                     ["eid-predator" :movie/director "eid-john-mctiernan"]
                     ["eid-john-mctiernan"
                      :person/name
                      "John McTiernan"]]}
                  #{[["eid-john-mctiernan" :person/name "John McTiernan"]
                     ["eid-die-hard" :movie/director "eid-john-mctiernan"]
                     ["eid-die-hard" :movie/title "Die Hard"]]
                    [["eid-john-mctiernan" :person/name "John McTiernan"]
                     ["eid-predator" :movie/director "eid-john-mctiernan"]
                     ["eid-predator" :movie/title "Predator"]]}]
                 (resolvers/walk-friendly
                  r
                  (map :join-rows
                       (map drop-join-rows-created-at
                            (d/send-query-batch ctx (aurora/conn-pool :read) [[app-id named-ps-1]
                                                                              [app-id named-ps-2]])))))))))))

(def ^:dynamic *count-atom* nil)

(defmacro with-count-sql-select-arrays [count-atom & body]
  `(let [select-arrays# (var-get #'sql/select-arrays)]
     ;; with-redefs rebinds globally, this binding trick will make sure
     ;; anything happening in parallel doesn't affect our count
     (binding [*count-atom* ~count-atom]
       (with-redefs [sql/select-arrays (fn
                                         ([tag# conn# query#]
                                          (sql/select-arrays tag# conn# query# nil))
                                         ([tag# conn# query# opts#]
                                          (when *count-atom*
                                            (swap! *count-atom* inc))
                                          (select-arrays# tag# conn# query# opts#)))]
         ~@body))))

(deftest queries
  (with-movies-app
    (fn [app r]
      (let [ctx (make-ctx app)
            query-pretty (partial query-pretty ctx r)]
        (testing "simple query"
          (let [tina-turner-eid (resolvers/->uuid r "eid-tina-turner")]
            (is (= '{:topics [[:ea #{"eid-tina-turner"} _ _]]

                     :symbol-values {?a #{:person/name :person/born :person/id}},

                     :join-rows #{[("eid-tina-turner" :person/id "eid-tina-turner")]
                                  [["eid-tina-turner" :person/name "Tina Turner"]]
                                  [["eid-tina-turner" :person/born "1939-11-26T00:00:00Z"]]}}

                   (query-pretty
                    [[:ea tina-turner-eid '?a]])))))

        (testing "attr-jump"
          (let [movie-title-aid (resolvers/->uuid r :movie/title)
                movie-year-aid (resolvers/->uuid r :movie/year)]
            (is (= '{:topics [[:ea _ #{:movie/year} #{1987}]
                              [:ea #{"eid-lethal-weapon" "eid-robocop" "eid-predator"} #{:movie/title} _]],

                     :symbol-values {?e #{"eid-lethal-weapon" "eid-robocop" "eid-predator"},
                                     ?title #{"Predator" "RoboCop" "Lethal Weapon"}},

                     :join-rows #{[["eid-robocop" :movie/year 1987]
                                   ["eid-robocop" :movie/title "RoboCop"]]
                                  [["eid-lethal-weapon" :movie/year 1987]
                                   ["eid-lethal-weapon" :movie/title "Lethal Weapon"]]
                                  [["eid-predator" :movie/year 1987]
                                   ["eid-predator" :movie/title "Predator"]]}}
                   (query-pretty
                    [[:ea '?e movie-year-aid 1987]
                     [:ea '?e movie-title-aid '?title]])))))
        (testing "refs jump eav"
          (let [movie-title-aid (resolvers/->uuid r :movie/title)
                movie-director-aid (resolvers/->uuid r :movie/director)
                person-name-aid (resolvers/->uuid r :person/name)]
            (is (= '{:topics
                     [[:ea _ #{:movie/title} #{"Predator"}]
                      [:vae #{"eid-predator"} #{:movie/director} _]
                      [:ea _ #{:person/name} _]]
                     :symbol-values {?e #{"eid-predator"},
                                     ?director #{"eid-john-mctiernan"},
                                     ?name #{"John McTiernan"}},

                     :join-rows #{[["eid-predator" :movie/title "Predator"]
                                   ["eid-predator" :movie/director "eid-john-mctiernan"]
                                   ["eid-john-mctiernan" :person/name "John McTiernan"]]}}

                   (query-pretty
                    [[:ea '?e movie-title-aid "Predator"]
                     [:vae '?e movie-director-aid '?director]
                     [:ea '?director person-name-aid '?name]])))))

        (testing "refs jump vae"
          (let [movie-title-aid (resolvers/->uuid r :movie/title)
                movie-director-aid (resolvers/->uuid r :movie/director)
                person-name-aid (resolvers/->uuid r :person/name)]
            (is (= '{:topics [[:ea _ #{:person/name} #{"John McTiernan"}]
                              [:vae _ #{:movie/director} #{"eid-john-mctiernan"}]
                              [:ea #{"eid-predator" "eid-die-hard"} #{:movie/title} _]],

                     :symbol-values {?director #{"eid-john-mctiernan"},
                                     ?movie #{"eid-predator" "eid-die-hard"},
                                     ?title #{"Predator" "Die Hard"}},,

                     :join-rows #{[["eid-john-mctiernan" :person/name "John McTiernan"]
                                   ["eid-die-hard" :movie/director "eid-john-mctiernan"]
                                   ["eid-die-hard" :movie/title "Die Hard"]]
                                  [["eid-john-mctiernan" :person/name "John McTiernan"]
                                   ["eid-predator" :movie/director "eid-john-mctiernan"]
                                   ["eid-predator" :movie/title "Predator"]]}}

                   (query-pretty
                    [[:ea '?director person-name-aid "John McTiernan"]
                     [:vae '?movie movie-director-aid '?director]
                     [:ea '?movie movie-title-aid '?title]])))))

        (testing "batching"
          (with-open [conn-pool (sql/start-pool
                                 (assoc (config/get-aurora-config)
                                        :maximumPoolSize 1))]
            ;; Take the only available connection
            (let [hold-conn (.getConnection conn-pool)
                  loader (d/make-loader)
                  ctx {:db {:conn-pool conn-pool}
                       :app-id (:id app)
                       :datalog-loader loader}
                  movie-title-aid (resolvers/->uuid r :movie/title)
                  movie-director-aid (resolvers/->uuid r :movie/director)
                  person-name-aid (resolvers/->uuid r :person/name)
                  counts (atom 0)]

              (with-count-sql-select-arrays counts
                (let [q1 (future (as-> (d/query
                                        ctx
                                        [[:ea '?director person-name-aid "John McTiernan"]
                                         [:vae '?movie movie-director-aid '?director]
                                         [:ea '?movie movie-title-aid '?title]])
                                     %
                                     (resolvers/walk-friendly r %)
                                     (drop-join-rows-created-at %)))
                      q2 (future (as-> (d/query
                                        ctx [[:ea '?e movie-title-aid "Predator"]
                                             [:vae '?e movie-director-aid '?director]
                                             [:ea '?director person-name-aid '?name]])
                                     %
                                     (resolvers/walk-friendly r %)
                                     (drop-join-rows-created-at %)))]

                  ;; Wait for queries to batch
                  (loop [i 0]
                    (when (not= 2 (count (get-in @loader [conn-pool :items])))
                      (when (> i 10)
                        (throw
                         (Exception.
                          "Queries took too long to batch. Something must be broken.")))
                      (println "waiting")
                      (Thread/sleep i)
                      (recur (inc i))))

                  ;; Return the connection so that queries can complete
                  (.close hold-conn)

                  (is (=
                       '{:topics [[:ea _ #{:person/name} #{"John McTiernan"}]
                                  [:vae _ #{:movie/director} #{"eid-john-mctiernan"}]
                                  [:ea #{"eid-predator" "eid-die-hard"} #{:movie/title} _]],

                         :symbol-values {?director #{"eid-john-mctiernan"},
                                         ?movie #{"eid-predator" "eid-die-hard"},
                                         ?title #{"Predator" "Die Hard"}},

                         :join-rows #{[["eid-john-mctiernan" :person/name "John McTiernan"]
                                       ["eid-die-hard" :movie/director "eid-john-mctiernan"]
                                       ["eid-die-hard" :movie/title "Die Hard"]]
                                      [["eid-john-mctiernan" :person/name "John McTiernan"]
                                       ["eid-predator" :movie/director "eid-john-mctiernan"]
                                       ["eid-predator" :movie/title "Predator"]]}}
                       @q1))
                  (is (=
                       '{:topics [[:ea _ #{:movie/title} #{"Predator"}]
                                  [:vae #{"eid-predator"} #{:movie/director} _]
                                  [:ea _ #{:person/name} _]]

                         :symbol-values {?e #{"eid-predator"},
                                         ?director #{"eid-john-mctiernan"},
                                         ?name #{"John McTiernan"}}

                         :join-rows #{[["eid-predator" :movie/title "Predator"]
                                       ["eid-predator" :movie/director "eid-john-mctiernan"]
                                       ["eid-john-mctiernan" :person/name "John McTiernan"]]}}
                       @q2))

                  (testing "we only make a single sql query for both d/query calls"
                    (is (= @counts 1))))))))))))

(deftest lookup-refs
  (with-zeneca-app
    (fn [app r]
      (testing "e side"
        (let [handle-aid (resolvers/->uuid r :users/handle)
              name-aid (resolvers/->uuid r :users/fullName)]
          (is (= #{"Alex"}
                 (->> (d/query
                       {:db {:conn-pool (aurora/conn-pool :read)}
                        :app-id (:id app)}
                       [[:ea [handle-aid "alex"] name-aid '?name]])
                      :join-rows
                      (map (comp last drop-last last))
                      set))))))))

(deftest generates-a-single-param-for-entity-ids-if-possible
  (with-zeneca-app
    (fn [app _r]
      (let [ids (set [(random-uuid)
                      (random-uuid)])
            {:keys [query]}
            (d/nested-match-query {:db {:conn-pool (aurora/conn-pool :read)}
                                   :app-id (:id app)}
                                  :match-0-
                                  (:id app)
                                  (d/nested->named-patterns
                                   {:children {:pattern-groups
                                               [{:patterns [[:ea ids]]}]}}))
            [_q app-id-param e-param] (hsql/format query)]
        ;; Check that the params are what we expect
        (is (= app-id-param (:id app)))
        ;; Check that we got a single param for the set of e
        (is (= e-param ids))))))

(deftest can-handle-many-entity-ids
  (with-zeneca-app
    (fn [app r]
      (let [ids (conj (set (repeatedly 100000 random-uuid))
                      (resolvers/->uuid r "eid-alex"))
            res (d/query {:db {:conn-pool (aurora/conn-pool :read)}
                          :app-id (:id app)}
                         [[:ea ids #{(resolvers/->uuid r :users/id)}]])]
        (is (= #{[["eid-alex" :users/id "eid-alex" 1610218387000]]}
               (resolvers/walk-friendly r
                                        (:join-rows res))))))))

(comment
  (test/run-tests *ns*))
