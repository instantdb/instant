(ns instant.db.scoped-query-hints-test
  (:require [clojure.test :refer [deftest is testing]]
            [instant.db.attr-sketch :as cms]
            [instant.db.datalog :as d]
            [instant.db.instaql :as iq]
            [instant.db.model.attr :as attr-model]
            [instant.flags :as flags]
            [instant.util.instaql :as instaql-util]
            [instant.util.tracer :as tracer]))

(def app-id #uuid "324b0c54-bf82-437e-9a31-fbc637ab61d2")
(def channels (mapv #(str "channel-" %) (range 7)))
(def query
  {:notif {:$ {:where {:and [{:client_id "tenant"}
                             {:or (mapv #(hash-map :channel %) channels)}]}
               :limit 1
               :order {:serverCreatedAt "desc"}}}})
(def attrs
  (attr-model/wrap-attrs
   (mapv (fn [n field]
           {:id (java.util.UUID. 0 n)
            :forward-identity [(java.util.UUID. 1 n) "notif" field]
            :value-type :blob :cardinality :one
            :index? true :unique? (= field "id")})
         [1 2 3] ["id" "client_id" "channel"])))
(def sketches
  (into {}
        (map (fn [attr]
               (let [field (last (:forward-identity attr))
                     sketch (case field
                              "client_id" (cms/add (cms/make-sketch) nil "tenant" 3690)
                              "channel" (reduce #(cms/add %1 nil %2 150) (cms/make-sketch) channels)
                              (cms/make-sketch))]
                 [{:app-id app-id :attr-id (:id attr)}
                  {:sketch (assoc sketch :total 10000)}]))
             attrs)))

(defn compile-query
  ([q] (compile-query q {}))
  ([q overrides]
   (let [ctx (merge {:app-id app-id :attrs attrs :sketches sketches
                     :query-normalized (instaql-util/normalized-forms q)}
                    overrides)
         patterns (:patterns (iq/instaql-query->patterns ctx q))
         named (d/annotate-with-hints-impl ctx {} (d/nested->named-patterns patterns))]
     (:query (d/nested-match-query ctx :m- (:app-id ctx) named)))))

(def join-hints [[:'Leading :t0 :t1 :t2] [:'HashJoin :t0 :t1]])
(defn scoped-hints [compiled]
  (filterv #(contains? #{:'Leading :'HashJoin} (first %)) (:pg-hints compiled)))

(deftest scoped-hints-preserve-the-query
  (binding [d/*enable-pg-hints* true]
    (let [compiled (compile-query query)
          original (with-redefs [d/scoped-query-hints (fn [_ _ _ hints] hints)]
                     (compile-query query))]
      (is (= join-hints (scoped-hints compiled)))
      (is (= (update compiled :pg-hints #(vec (remove (set join-hints) %))) original))
      (is (= [] (scoped-hints (compile-query query {:app-id (random-uuid)}))))
      (is (= [] (scoped-hints (compile-query query {:query-normalized nil})))))))

(deftest only-the-measured-shape-is-eligible
  (binding [d/*enable-pg-hints* true]
    (doseq [[label q] [[:limit (assoc-in query [:notif :$ :limit] 2)]
                       [:order (assoc-in query [:notif :$ :order :serverCreatedAt] "asc")]
                       [:channels (update-in query [:notif :$ :where :and 1 :or] pop)]
                       [:fields (assoc-in query [:notif :$ :fields] ["channel"])]
                       [:cursor (assoc-in query [:notif :$ :after]
                                          [(str (java.util.UUID. 0 10))
                                           (str (java.util.UUID. 0 1))
                                           (str (java.util.UUID. 0 10)) 1000])]]]
      (testing (name label)
        (is (empty? (scoped-hints (compile-query q))))))))

(deftest changed-join-layout-or-scan-choice-is-ineligible
  (binding [d/*enable-pg-hints* true]
    (let [compiled (compile-query query)
          ctes (vec (:with compiled))
          hints (vec (remove (set join-hints) (:pg-hints compiled)))
          ctx {:query-normalized (instaql-util/normalized-forms query)}
          apply-hints (fn [ctes hints] (#'d/scoped-query-hints ctx app-id ctes hints))]
      (is (= (into hints join-hints) (apply-hints ctes hints)))
      (doseq [changed [(assoc-in ctes [0 2] :materialized)
                       (assoc-in ctes [1 1 :from] [[:triples :other] :m-0])
                       (assoc-in ctes [2 1 :where] [:and [:= :entity-id :m-0-entity-id]])]]
        (is (= hints (apply-hints changed hints))))
      (doseq [changed [(conj hints [:'NestLoop :t0 :t1])
                       (conj hints [:'IndexScan :t0 :ave_with_e_index])
                       (conj hints [:'FutureHint :t0])
                       (mapv #(if (= % [:'IndexScan :t1 :ave_with_e_index])
                                [:'IndexScan :t1 :triples_pkey] %) hints)
                       (filterv #(not= % [:'BitmapScan :t2 :ea_index]) hints)]]
        (is (= changed (apply-hints ctes changed)))))))

(deftest existing-hint-switches-take-precedence
  (binding [d/*enable-pg-hints* false]
    (is (empty? (scoped-hints (compile-query query)))))
  (binding [d/*enable-pg-hints* true]
    (with-redefs [flags/toggled? (fn [flag & [default]]
                                  (if (= flag :disable-pg-hints) true default))]
      (is (empty? (:pg-hints (compile-query query))))))
  (let [ctx {:app-id app-id :attrs attrs :sketches sketches :query-hash 42
             :query-normalized (instaql-util/normalized-forms query)}
        patterns (:patterns (iq/instaql-query->patterns ctx query))]
    (with-redefs [flags/flag (fn [flag] (when (= flag :disable-hint-query-hashes) #{42}))
                  flags/toggled? (fn [_ & [default]] default)
                  tracer/add-data! (fn [& _])
                  d/send-query-nested (fn [ctx _ app-id named]
                                        (:query (d/nested-match-query ctx :m- app-id named)))]
      (is (empty? (scoped-hints (d/query-nested ctx patterns)))))))

(deftest modifiers-pass-the-effective-shape-with-the-original-hash
  (let [captured (atom nil)
        ctx {:app-id app-id :attrs attrs
             :datalog-query-fn (fn [ctx _] (reset! captured ctx) {:data []})}
        modified (assoc-in query [:notif :$ :limit] 2)]
    (with-redefs [flags/query-modifiers (fn [& _] [{:etype :notif :params {:limit 2}}])
                  iq/collect-query-results (fn [& _])
                  tracer/new-span! (fn [& _] (io.opentelemetry.api.trace.Span/getInvalid))
                  tracer/end-span! (fn [& _])]
      (iq/query-normal ctx query))
    (is (= (instaql-util/normalized-forms modified) (:query-normalized @captured)))
    (is (= (hash (instaql-util/normalized-forms query)) (:query-hash @captured)))))
