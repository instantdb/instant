(ns instant.model.schema
  (:require [instant.db.model.attr :as attr-model]
            [instant.util.coll :as coll]
            [instant.jdbc.aurora :as aurora]
            [instant.db.datalog :as d]
            [instant.model.rule :as rule-model]
            [instant.db.permissioned-transaction :as permissioned-tx]
            [instant.util.exception :as ex])
  (:import (java.util UUID)))

(defn map-map [f m]
  (into {} (map (fn [[k v]] [k (f [k v])]) m)))

(defn attr-ident-names [attr]
  (keep seq [(attr-model/fwd-ident-name attr) (attr-model/rev-ident-name attr)]))

(defn schemas->ops [current-schema new-schema]
  (let [{new-blobs :blobs new-refs :refs} new-schema
        eid-ops (map (fn [[ns-name _]] (if (get-in current-schema [:blobs ns-name])
                                         nil
                                         [:add-attr
                                          {:value-type :blob
                                           :cardinality :one
                                           :id (UUID/randomUUID)
                                           :forward-identity [(UUID/randomUUID) (name ns-name) "id"]
                                           :unique? false
                                           :index? false}])) new-blobs)
        blob-ops (mapcat
                  (fn [[ns-name attrs]]
                    (map (fn [[attr-name new-attr]]
                           (let
                            [current-attr (get-in current-schema [:blobs ns-name attr-name])
                             name-id? (= "id" (name attr-name))
                             new-attr? (not current-attr)
                             unchanged-attr? (and
                                              (= (get new-attr :unique?) (get current-attr :unique?))
                                              (= (get new-attr :index?) (get current-attr :index?)))]
                             (cond
                               name-id? nil
                               unchanged-attr? nil
                               new-attr?  [:add-attr
                                           {:value-type :blob
                                            :cardinality :one
                                            :id (UUID/randomUUID)
                                            :forward-identity [(UUID/randomUUID) (name ns-name) (name attr-name)]
                                            :unique? (:unique? new-attr)
                                            :index? (:index? new-attr)}]
                               :else [:update-attr
                                      {:value-type :blob
                                       :cardinality :one
                                       :id (:id current-attr)
                                       :forward-identity (:forward-identity current-attr)
                                       :unique? (:unique? new-attr)
                                       :index? (:index? new-attr)}])))
                         attrs))
                  new-blobs)
        ref-ops (map
                 (fn [[link-desc new-attr]]
                   (let
                    [[from-ns from-attr to-ns to-attr] link-desc
                     current-attr (get-in current-schema [:refs link-desc])
                     new-attr? (not current-attr)
                     unchanged-attr? (and
                                      (= (get new-attr :cardinality) (get current-attr :cardinality))
                                      (= (get new-attr :unique?) (get current-attr :unique?)))]
                     (cond
                       unchanged-attr? nil
                       new-attr? [:add-attr
                                  {:value-type :ref
                                   :id (UUID/randomUUID)
                                   :forward-identity [(UUID/randomUUID) from-ns from-attr]
                                   :reverse-identity [(UUID/randomUUID) to-ns to-attr]
                                   :cardinality (:cardinality new-attr)
                                   :unique? (:unique? new-attr)
                                   :index? (:index? new-attr)}]
                       :else [:update-attr
                              {:value-type :ref
                               :id (:id current-attr)
                               :forward-identity (:forward-identity current-attr)
                               :reverse-identity (:reverse-identity current-attr)
                               :cardinality (:cardinality new-attr)
                               :unique? (:unique? new-attr)
                               :index? (:index? new-attr)}])))
                 new-refs)
        steps  (->> (concat eid-ops blob-ops ref-ops)
                    (filter some?)
                    vec)]

    steps))

(defn attrs->schema [attrs]
  (let [{blobs :blob refs :ref} (group-by :value-type attrs)
        refs-indexed (into {} (map (fn [{:keys [forward-identity reverse-identity] :as attr}]
                                     [[(second forward-identity)
                                       (coll/third forward-identity)
                                       (second reverse-identity)
                                       (coll/third reverse-identity)] attr])
                                   refs))
        blobs-indexed (->> blobs
                           (group-by #(-> % attr-model/fwd-etype keyword))
                           (map-map (fn [[_ attrs]]
                                      (into {}
                                            (map (fn [a]
                                                   [(keyword (-> a :forward-identity coll/third))
                                                    a])
                                                 attrs)))))]
    {:refs refs-indexed :blobs blobs-indexed}))


(def relationships->schema-params {[:many :many] {:cardinality :many
                                                  :unique? false}
                                   [:one :one] {:cardinality :one
                                                :unique? true}
                                   [:many :one] {:cardinality :many
                                                 :unique? true}
                                   [:one :many] {:cardinality :one
                                                 :unique? false}})

(defn defs->schema [defs]
  (let [{entities :entities links :links} defs
        refs-indexed (into {} (map (fn [[_ {forward :forward reverse :reverse}]]
                                     [[(:on forward) (:label forward) (:on reverse) (:label reverse)]
                                      (merge
                                       {:id nil
                                        :value-type :ref
                                        :index? false
                                        :forward-identity [nil (:on forward) (:label forward)]
                                        :reverse-identity [nil (:on reverse) (:label reverse)]}
                                       (get relationships->schema-params
                                            [(keyword (:has forward)) (keyword (:has reverse))]))])
                                   links))
        blobs-indexed (map-map (fn [[ns-name def]]
                                 (map-map (fn [[attr-name attr-def]]
                                            {:id nil
                                             :value-type :blob
                                             :cardinality :one
                                             :forward-identity [nil (name ns-name) (name attr-name)]
                                             :unique? (or (-> attr-def :config :unique) false)
                                             :index? (or (-> attr-def :config :indexed) false)})
                                          (:attrs def)))
                               entities)]
    {:refs refs-indexed :blobs blobs-indexed}))

(defn dup-message [etype label]
  (str "Duplicate entry found for attribute: "
       etype
       "->"
       label
       ". "
       "Check your schema file for duplicate link definitions."))

(defn assert-unique-idents! [current-attrs steps]
  (let [current-ident-names (->> current-attrs
                                 (mapcat attr-ident-names)
                                 (map vec))
        ident-names (->>
                     steps
                     (mapcat (fn [[op data]]
                               (when (= op :add-attr)
                                 (attr-ident-names data)))))
        dups (->> (concat current-ident-names ident-names)
                  (frequencies)
                  (filter (fn [[_ freq]] (> freq 1))))
        errors (map (fn [[[etype label]]]
                      {:in [:schema]
                       :message (dup-message etype label)}) dups)]
    (ex/assert-valid! :schema
                      :steps
                      errors)))

;; ---- 
;; API

(defn plan!
  [app-id client-defs]
  (let [new-schema (defs->schema client-defs)
        current-attrs (attr-model/get-by-app-id aurora/conn-pool app-id)
        current-schema (attrs->schema current-attrs)
        steps (schemas->ops current-schema new-schema)]
    (assert-unique-idents! current-attrs steps)
    {:new-schema new-schema
     :current-schema current-schema
     :current-attrs current-attrs
     :steps steps}))

(comment
  (attr-ident-names {:id "",
                     :value-type :blob,
                     :cardinality :one,
                     :forward-identity ["" "tags" "x"],
                     :unique? false,
                     :index? false,
                     :inferred-types nil})
  (schemas->ops
   {:refs {}
    :blobs {:ns {:a {:unique? "one"}}}}
   {:refs {["comments" "post" "posts" "x"] {:unique? true :cardinality "one"}
           ["comments" "post" "posts" "comments"] {:unique? true :cardinality "one"}}
    :blobs {:ns {:a {:cardinality "many"} :b {:cardinality  "many"}}}})
  (schemas->ops
   {:refs {}
    :blobs {:ns {:a {:unique? "one"}}}}
   {:refs {["comments" "post" "posts" "comments"] {:unique? true :cardinality "one"}}
    :blobs {:ns {:a {:cardinality "many"} :b {:cardinality  "many"}}}}))


(defn apply-plan! [app-id {:keys [steps] :as _plan}]
  (let [ctx {:admin? true
             :db {:conn-pool aurora/conn-pool}
             :app-id app-id
             :attrs (attr-model/get-by-app-id aurora/conn-pool app-id)
             :datalog-query-fn d/query
             :rules (rule-model/get-by-app-id aurora/conn-pool
                                              {:app-id app-id})}]
    (permissioned-tx/transact! ctx steps)))
