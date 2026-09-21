(ns instant.reactive.seeks-query-cpu-test
  (:require [clojure.test :refer [deftest is testing]]
            [instant.db.instaql :as iq]
            [instant.db.model.attr :as attr-model]
            [instant.flags :as flags]
            [instant.reactive.query :as rq]
            [instant.reactive.store :as rs]
            [instant.util.json :as json]))

(def app-id #uuid "8ad982d7-09bc-45bd-83c4-8d56ebf32286")
(def queries [{:seeks {}}
              {:seeks {:$ {:where {:resultsCount {:$gt 0} :indexable {:$ne false}}}}}])

(def attrs
  (attr-model/wrap-attrs
   (mapv (fn [n]
           {:id (java.util.UUID. 1 n)
            :forward-identity [(java.util.UUID. 2 n) "seeks" (if (zero? n) "id" (str "field" n))]
            :value-type :blob :cardinality :one :unique? (zero? n)})
         (range 19))))

(defn nodes [n]
  [{:data {:k "seeks" :etype "seeks"
           :datalog-result {:join-rows #{} :topics []}}
    :child-nodes
    (mapv (fn [i]
            (let [eid (java.util.UUID. 3 i)]
              {:data {:etype "seeks"
                      :datalog-result
                      {:join-rows
                       (into #{} (map-indexed (fn [j attr]
                                               [[eid (:id attr)
                                                 (case j
                                                   0 eid
                                                   1 nil
                                                   2 false
                                                   3 {"nested" [i true nil]}
                                                   (str "value-" i "-" j))
                                                 i]])
                                             attrs))}}
               :child-nodes []}))
          (range n))}])

(defn enabled [features]
  {:seeks-query-cpu {(str app-id) (into {} (map #(vector (name %) true)) features)}})

(def toggles
  {:disable-seeks-query-cpu false
   :disable-scoped-refresh-results false
   :disable-scoped-triple-collection false
   :instaql-topic-compiler false})

(defn context []
  {:app-id app-id :session-id (random-uuid) :attrs attrs :skip-unchanged-result? true})

(deftest measured-shapes-use-the-existing-transient-collector
  (doseq [q queries]
    (let [input (nodes 20)
          normal rq/collect-instaql-results-for-client
          transient-collector @#'rq/collect-instaql-results-with-transients
          calls (atom [])]
      (binding [flags/*flag-overrides* (enabled [:triple-collection])
                flags/*toggle-overrides* toggles]
        (with-redefs [iq/permissioned-query (fn [& _] input)
                      rq/collect-instaql-results-for-client
                      (fn [input] (swap! calls conj :normal) (normal input))
                      rq/collect-instaql-results-with-transients
                      (fn [input] (swap! calls conj :transient) (transient-collector input))]
          (doseq [return-type [:join-rows :tree :legacy]]
            (reset! calls [])
            (let [ctx (context)
                  result (rq/instaql-query-reactive! (rs/init) ctx q return-type true)]
              (is (some? (:instaql-result result)))
              (is (= (case return-type :join-rows [:transient] :tree [] [:normal]) @calls))
              (when (= :join-rows return-type)
                (is (= (normal input) (:instaql-result result)))
                (is (= (json/->json (normal input)) (json/->json (:instaql-result result))))))))))))

(deftest unchanged-refreshes-still-run-the-query-and-permissions
  (doseq [q queries
          return-type [:tree :join-rows]]
    (let [input (atom (nodes 3))
          calls (atom 0)
          ctx (context)
          store (rs/init)]
      (binding [flags/*flag-overrides* (enabled [:skip-unchanged :triple-collection])
                flags/*toggle-overrides* toggles]
        (with-redefs [iq/permissioned-query (fn [& _] (swap! calls inc) @input)]
          (let [initial (rq/instaql-query-reactive! store ctx q return-type true)
                repeated (rq/instaql-query-reactive! store ctx q return-type true)]
            (is (true? (:result-changed? initial)))
            (is (some? (:instaql-result initial)))
            (is (false? (:result-changed? repeated)))
            (is (nil? (:instaql-result repeated)))
            (is (nil? (:result-meta repeated)))
            (is (= 2 @calls)))
          (testing "a caller that did not request skipping still gets its result"
            (is (some? (:instaql-result
                        (rq/instaql-query-reactive! store (dissoc ctx :skip-unchanged-result?)
                                                  q return-type true)))))
          (testing "changed results and schema still materialize"
            (reset! input (nodes 4))
            (is (true? (:result-changed? (rq/instaql-query-reactive! store ctx q return-type true))))
            (let [ctx (update ctx :attrs #(attr-model/wrap-attrs (mapv (fn [a] (assoc a :index? true)) %)))
                  changed (rq/instaql-query-reactive! store ctx q return-type true)]
              (is (true? (:result-changed? changed)))
              (is (some? (:instaql-result changed)))))
          (testing "a permission change that hides everything sends an empty result"
            (reset! input (nodes 0))
            (let [empty-result (rq/instaql-query-reactive! store ctx q return-type true)
                  repeated (rq/instaql-query-reactive! store ctx q return-type true)]
              (is (true? (:result-changed? empty-result)))
              (is (some? (:instaql-result empty-result)))
              (is (false? (:result-changed? repeated)))
              (is (nil? (:instaql-result repeated)))))
          (testing "permission failures still remove the subscription"
            (with-redefs [iq/permissioned-query (fn [& _] (throw (ex-info "denied" {})))]
              (is (thrown-with-msg? clojure.lang.ExceptionInfo #"denied"
                                   (rq/instaql-query-reactive! store ctx q return-type true)))
              (is (empty? (rs/session-instaql-queries store app-id (:session-id ctx)))))))))))

(deftest flags-are-independent-and-existing-kill-switches-still-apply
  (doseq [q queries]
    (let [skip? #'rq/skip-unchanged-result-enabled?
          transient? #'rq/transient-triple-collection-enabled?]
      (doseq [features [[] [:skip-unchanged] [:triple-collection] [:skip-unchanged :triple-collection]]]
        (binding [flags/*flag-overrides* (enabled features)
                  flags/*toggle-overrides* toggles]
          (is (= (boolean (some #{:skip-unchanged} features)) (boolean (skip? app-id q))))
          (is (= (boolean (some #{:triple-collection} features)) (boolean (transient? app-id q))))))
      (doseq [[feature gate kill-switch]
              [[:skip-unchanged skip? :disable-scoped-refresh-results]
               [:triple-collection transient? :disable-scoped-triple-collection]]]
        (doseq [kill [kill-switch :disable-seeks-query-cpu]]
          (binding [flags/*flag-overrides* (enabled [feature])
                    flags/*toggle-overrides* (assoc toggles kill true)]
            (is (not (gate app-id q)))))))))
