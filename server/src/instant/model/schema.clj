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

(defn dup-message [[etype label]]
  (str
   etype
   "->"
   label
   ": "
   "Duplicate entry found for attribute. "
   "Check your schema file for duplicate link definitions. "
   "If it's not in the schema file, it may have been generated by the backend. "
   "Check your full schema in the dashboard: "
   "https://www.instantdb.com/dash?s=main&t=explorer"))

(defn backwards-link-message [[etype label]]
  (str
   etype
   "->"
   label
   ": "
   "Conflicting link found for attribute. "
   "It's possible that you already have a link with the same label names, but in the reverse direction. "
   "We cannot automatically swap the direction of the link. "
   "To fix this, can: a) swap the `forward` and `reverse` parameters for this link in your schema file, or b) delete the existing link in the dashboard."
   "Check your full schema in the dashboard for a link with the same label names: "
   "https://www.instantdb.com/dash?s=main&t=explorer"))

(defn assert-unique-idents! [current-attrs steps]
  (let [current-link-attrs
        (filter (comp #{:ref} :value-type) current-attrs)

        current-blobs
        (filter (comp #{:blob} :value-type) current-attrs)

        current-blob-idents
        (->> current-blobs
             (map #(attr-model/fwd-ident-name %))
             (into #{}))

        current-links-mapping-fwd
        (->> current-link-attrs
             (map #(vector
                    (attr-model/fwd-ident-name %)
                    (attr-model/rev-ident-name %)))
             (into {}))

        current-links-mapping-rev
        (->> current-link-attrs
             (map #(vector
                    (attr-model/rev-ident-name %)
                    (attr-model/fwd-ident-name %)))
             (into {}))

        errors
        (->>
         steps
         (filter (comp #{:add-attr} first))
         (map second)
         (map #(let [fwd-name
                     (attr-model/fwd-ident-name %)

                     rev-name
                     (attr-model/rev-ident-name %)

                     is-existing-link-backwards?
                     (= rev-name (get current-links-mapping-rev fwd-name))

                     is-existing-blob?
                     (contains? current-blob-idents fwd-name)

                     is-existing-link-fwd?
                     (or (contains? current-links-mapping-fwd fwd-name)
                         (contains? current-links-mapping-rev fwd-name))

                     is-existing-link-rev?
                     (or (contains? current-links-mapping-fwd rev-name)
                         (contains? current-links-mapping-rev rev-name))]

                 (cond
                   is-existing-link-backwards?
                   (backwards-link-message fwd-name)

                   is-existing-link-fwd?
                   (dup-message fwd-name)

                   is-existing-link-rev?
                   (dup-message rev-name)

                   is-existing-blob?
                   (dup-message fwd-name)

                   :else nil)))
         (filter some?)
         (map #(hash-map :in [:schema] :message %)))]
    (ex/assert-valid! :schema :plan errors)))

(comment
  (def current-attrs [{:value-type :blob,
                       :id "",
                       :forward-identity
                       ["" "posts" "name"],
                       :cardinality :one,
                       :unique? false,
                       :index? false}
                      {:value-type :ref,
                       :id "",
                       :forward-identity
                       ["" "posts" "tags"],
                       :reverse-identity
                       ["" "tags" "posts"],
                       :cardinality :many,
                       :unique? false,
                       :index? false}])
  (def steps [[:add-attr
               {:value-type :ref,
                :id "",
                :forward-identity
                ["" "tags" "posts"],
                :reverse-identity
                ["" "posts" "tags"],
                :cardinality :many,
                :unique? false,
                :index? false}]
              [:add-attr
               {:value-type :ref,
                :id "",
                :forward-identity
                ["" "posts" "tags"],
                :reverse-identity
                ["" "tags" "posts"],
                :cardinality :many,
                :unique? false,
                :index? false}]
              [:add-attr
               {:value-type :ref,
                :id "",
                :forward-identity
                ["" "posts" "tags2"],
                :reverse-identity
                ["" "tags" "posts"],
                :cardinality :many,
                :unique? false,
                :index? false}]
              [:add-attr
               {:value-type :ref,
                :id "",
                :forward-identity
                ["" "tags" "posts2"],
                :reverse-identity
                ["" "posts" "tags"],
                :cardinality :many,
                :unique? false,
                :index? false}]
              [:add-attr
               {:value-type :blob,
                :id "",
                :forward-identity
                ["" "posts" "name"],
                :cardinality :one,
                :unique? false,
                :index? false}]
              [:add-attr
               {:value-type :blob,
                :id "",
                :forward-identity
                ["" "posts" "content"],
                :cardinality :one,
                :unique? false,
                :index? false}]])
  (assert-unique-idents! current-attrs steps))

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
