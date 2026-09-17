(ns instant.db.row-hints-flag-test
  (:require [clojure.test :refer [deftest is testing]]
            [instant.db.attr-sketch :as cms]
            [instant.db.datalog :as d]
            [instant.db.instaql :as iq]
            [instant.db.model.attr :as attr-model]
            [instant.flags :as flags]
            [instant.util.instaql :as instaql-util]))

(def app-id #uuid "5a0c1d2e-7b3f-4c6a-9e8d-1f2a3b4c5d6e")

(def attrs
  (attr-model/wrap-attrs
   (mapv (fn [n field]
           (cond-> {:id (java.util.UUID. 0 n)
                    :forward-identity [(java.util.UUID. 1 n) "prices" field]
                    :value-type :blob :cardinality :one
                    :index? (= field "modified") :unique? (= field "id")}
             (= field "modified") (assoc :checked-data-type :number)))
         [1 2 3] ["id" "modified" "value"])))

(def query
  {:prices {:$ {:where {:and [{:modified {:$gt 100}} {:modified {:$lte 200}}]}
                :order {:modified "asc"} :first 50}}})

(defn row-hints [app-id]
  (let [normalized (instaql-util/normalized-forms query)
        ctx {:app-id app-id :attrs attrs
             :query-normalized normalized
             :query-hash (hash normalized)
             :sketches (into {} (map (fn [a]
                                       [{:app-id app-id :attr-id (:id a)}
                                        {:sketch (assoc (cms/make-sketch) :total 240000)}])
                                     attrs))}
        patterns (:patterns (iq/instaql-query->patterns ctx query))
        named (d/annotate-with-hints-impl ctx {} (d/nested->named-patterns patterns))]
    (binding [d/*enable-pg-hints* true]
      (->> (d/nested-match-query ctx :m- app-id named)
           :query
           :pg-hints
           (filter #(= :'Rows (first %)))))))

(deftest row-hints-can-be-disabled-per-app
  (is (seq (row-hints app-id)))
  (binding [flags/*flag-overrides* {:disable-row-hints-apps #{app-id}}]
    (testing "the listed app loses only its row hints"
      (is (empty? (row-hints app-id))))
    (testing "other apps keep theirs"
      (is (seq (row-hints (random-uuid)))))))
