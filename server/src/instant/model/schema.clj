(ns instant.model.schema
  (:require [instant.db.model.attr :as attr-model]
            [instant.util.coll :as coll]
            [instant.jdbc.aurora :as aurora]
            [instant.db.datalog :as d]
            [instant.db.indexing-jobs :as indexing-jobs]
            [instant.model.rule :as rule-model]
            [instant.db.permissioned-transaction :as permissioned-tx]
            [instant.util.exception :as ex])
  (:import (java.util UUID)))

(defn map-map [f m]
  (into {} (map (fn [[k v]] [k (f [k v])]) m)))

(defn attr-ident-names [attr]
  (keep seq [(attr-model/fwd-ident-name attr) (attr-model/rev-ident-name attr)]))

(defn schemas->ops [{:keys [check-types?
                            background-updates?]}
                    current-schema
                    new-schema]
  (let [{new-blobs :blobs new-refs :refs} new-schema
        eid-ops (map (fn [[ns-name _]] (if (get-in current-schema [:blobs ns-name])
                                         nil
                                         [:add-attr
                                          {:value-type :blob
                                           :cardinality :one
                                           :id (UUID/randomUUID)
                                           :forward-identity [(UUID/randomUUID) (name ns-name) "id"]
                                           :unique? true
                                           :index? false}])) new-blobs)
        blob-ops (mapcat
                  (fn [[ns-name attrs]]
                    (mapcat (fn [[attr-name new-attr]]
                              (let [current-attr (get-in current-schema [:blobs ns-name attr-name])
                                    name-id? (= "id" (name attr-name))
                                    new-attr? (not current-attr)
                                    changed-type? (and check-types?
                                                       (not= (get new-attr :checked-data-type)
                                                             (get current-attr :checked-data-type)))
                                    changed-unique? (not= (get new-attr :unique?) (get current-attr :unique?))
                                    changed-index? (not= (get new-attr :index?) (get current-attr :index?))
                                    attr-changed? (or changed-unique? changed-index?)]
                                (cond
                                  name-id? nil
                                  new-attr? [[:add-attr
                                              (cond-> {:value-type :blob
                                                       :cardinality :one
                                                       :id (UUID/randomUUID)
                                                       :forward-identity [(UUID/randomUUID) (name ns-name) (name attr-name)]
                                                       :unique? (:unique? new-attr)
                                                       :index? (:index? new-attr)}
                                                (and check-types? (:checked-data-type new-attr))
                                                (assoc :checked-data-type (:checked-data-type new-attr)))]]
                                  :else (concat (when (and attr-changed?
                                                           (not background-updates?))
                                                  [[:update-attr
                                                    {:value-type :blob
                                                     :cardinality :one
                                                     :id (:id current-attr)
                                                     :forward-identity (:forward-identity current-attr)
                                                     :unique? (:unique? new-attr)
                                                     :index? (:index? new-attr)}]])
                                                (when (and background-updates?
                                                           changed-index?)
                                                  [[(if (:index? new-attr) :index :remove-index)
                                                    {:attr-id (:id current-attr)
                                                     :forward-identity (:forward-identity current-attr)}]])
                                                (when (and background-updates?
                                                           changed-unique?)
                                                  [[(if (:unique? new-attr) :unique :remove-unique)
                                                    {:attr-id (:id current-attr)
                                                     :forward-identity (:forward-identity current-attr)}]])
                                                (when (and changed-type?
                                                           (not (= :system (:catalog current-attr))))
                                                  (if-let [new-data-type (:checked-data-type new-attr)]
                                                    [[:check-data-type
                                                      {:attr-id (:id current-attr)
                                                       :checked-data-type (name new-data-type)
                                                       :forward-identity (:forward-identity current-attr)}]]
                                                    [[:remove-data-type
                                                      {:attr-id (:id current-attr)
                                                       :forward-identity (:forward-identity current-attr)}]]))))))
                            attrs))
                  new-blobs)
        ref-ops (map
                 (fn [[link-desc new-attr]]
                   (let [[from-ns from-attr to-ns to-attr] link-desc
                         current-attr (get-in current-schema [:refs link-desc])
                         new-attr? (not current-attr)
                         unchanged-attr? (and
                                          (= (get new-attr :cardinality) (get current-attr :cardinality))
                                          (= (get new-attr :unique?) (get current-attr :unique?))
                                          (= (get new-attr :on-delete) (get current-attr :on-delete))
                                          (= (get new-attr :on-delete-reverse) (get current-attr :on-delete-reverse)))]
                     (cond
                       unchanged-attr? nil
                       new-attr? [:add-attr
                                  {:value-type :ref
                                   :id (UUID/randomUUID)
                                   :forward-identity [(UUID/randomUUID) from-ns from-attr]
                                   :reverse-identity [(UUID/randomUUID) to-ns to-attr]
                                   :cardinality (:cardinality new-attr)
                                   :unique? (:unique? new-attr)
                                   :index? (:index? new-attr)
                                   :on-delete (:on-delete new-attr)
                                   :on-delete-reverse (:on-delete-reverse new-attr)}]
                       :else [:update-attr
                              {:value-type :ref
                               :id (:id current-attr)
                               :forward-identity (:forward-identity current-attr)
                               :reverse-identity (:reverse-identity current-attr)
                               :cardinality (:cardinality new-attr)
                               :unique? (:unique? new-attr)
                               :index? (:index? new-attr)
                               :on-delete (:on-delete new-attr)
                               :on-delete-reverse (:on-delete-reverse new-attr)}])))
                 new-refs)
        steps  (->> (concat eid-ops blob-ops ref-ops)
                    (filter some?)
                    vec)]

    steps))

(defn attrs->schema [attrs]
  (let [filtered-attrs (attr-model/remove-hidden attrs)
        {blobs :blob refs :ref} (group-by :value-type filtered-attrs)
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

(defn filter-indexed-blobs
  [coll-name attrs-map]
  (let [attrs-seq (for [[_attr-name attr-def] attrs-map]
                    (assoc attr-def
                           :catalog (if (.startsWith (name coll-name) "$") :system :user)))
        filtered-seq (attr-model/remove-hidden (attr-model/wrap-attrs attrs-seq))]
    (into {}
          (for [attr filtered-seq]
            [(keyword (attr-model/fwd-label attr)) attr]))))

(defn defs->schema [defs]
  (let [{entities :entities links :links} defs
        refs-indexed (into {} (map (fn [[_ {:keys [forward reverse]}]]
                                     [[(:on forward) (:label forward) (:on reverse) (:label reverse)]
                                      {:id                nil
                                       :value-type        :ref
                                       :index?            false
                                       :on-delete         (some-> forward :onDelete keyword)
                                       :on-delete-reverse (some-> reverse :onDelete keyword)
                                       :forward-identity  [nil (:on forward) (:label forward)]
                                       :reverse-identity  [nil (:on reverse) (:label reverse)]
                                       :cardinality       (keyword (:has forward))
                                       :unique?           (= "one" (:has reverse))}])
                                   links))
        blobs-indexed (map-map (fn [[ns-name def]]
                                 (map-map (fn [[attr-name attr-def]]
                                            {:id                nil
                                             :value-type        :blob
                                             :cardinality       :one
                                             :forward-identity  [nil (name ns-name) (name attr-name)]
                                             :unique?           (or (-> attr-def :config :unique) false)
                                             :index?            (or (-> attr-def :config :indexed) false)
                                             :checked-data-type (let [{:keys [valueType]} attr-def]
                                                                  (when (contains? attr-model/checked-data-types valueType)
                                                                    (keyword valueType)))})
                                          (:attrs def)))
                               entities)
        blobs-filtered (into {}
                             (for [[coll-name attrs-map] blobs-indexed
                                   :let [filtered-attrs (filter-indexed-blobs coll-name attrs-map)]
                                   :when (seq filtered-attrs)]
                               [coll-name filtered-attrs]))]
    {:refs refs-indexed
     :blobs blobs-filtered}))

(defn dup-message [[etype label]]
  (str etype "->" label ": "
       "Duplicate entry found for attribute. "
       "Check your schema file for duplicate link definitions. "
       "If it's not in the schema file, it may have been generated by the backend. "
       "Check your full schema in the dashboard: "
       "https://www.instantdb.com/dash?s=main&t=explorer"))

(defn backwards-link-message [[etype label]]
  (str etype "->" label ": "
       "Conflicting link found for attribute. "
       "It's possible that you already have a link with the same label names, but in the reverse direction. "
       "We cannot automatically swap the direction of the link. "
       "To fix this, can: a) swap the `forward` and `reverse` parameters for this link in your schema file, or b) delete the existing link in the dashboard."
       "Check your full schema in the dashboard for a link with the same label names: "
       "https://www.instantdb.com/dash?s=main&t=explorer"))

(defn cascade-message [[etype label]]
  (str etype "->" label ": "
       "Cascade delete is only possible on links with `has: 'one'`. "
       "Check your full schema in the dashboard: "
       "https://www.instantdb.com/dash?s=main&t=explorer"))

(defn plan-errors [current-attrs steps]
  (let [current-link-attrs
        (filter (comp #{:ref} :value-type) current-attrs)

        current-blobs
        (filter (comp #{:blob} :value-type) current-attrs)

        current-blob-idents
        (->> current-blobs
             (map attr-model/fwd-ident-name)
             (into #{}))

        current-links-mapping-fwd
        (->> current-link-attrs
             (map (juxt attr-model/fwd-ident-name attr-model/rev-ident-name))
             (into {}))

        current-links-mapping-rev
        (->> current-link-attrs
             (map (juxt attr-model/rev-ident-name attr-model/fwd-ident-name))
             (into {}))

        errors
        (concat
         (for [[op attr] steps
               :when (= :add-attr op)
               :let [fwd-name (attr-model/fwd-ident-name attr)
                     rev-name (attr-model/rev-ident-name attr)
                     current-rev-name (get current-links-mapping-rev fwd-name)
                     message
                     (cond
                       ;; link-backwards-conflict?
                       (and (not (and (nil? rev-name)
                                      (nil? current-rev-name)))
                            (= rev-name current-rev-name))
                       (backwards-link-message fwd-name)

                       ;; link-fwd-exists?
                       (or (contains? current-links-mapping-fwd fwd-name)
                           (contains? current-links-mapping-rev fwd-name))
                       (dup-message fwd-name)

                       ;; link-rev-exists?
                       (or (contains? current-links-mapping-fwd rev-name)
                           (contains? current-links-mapping-rev rev-name))
                       (dup-message rev-name)

                       ;; blob-exists?
                       (contains? current-blob-idents fwd-name)
                       (dup-message fwd-name))]
               :when message]
           {:in [:schema]
            :message message})
         (for [[op attr] steps
               :when (#{:add-attr :update-attr} op)
               :let [fwd-name (attr-model/fwd-ident-name attr)
                     rev-name (attr-model/rev-ident-name attr)
                     message
                     (cond
                       ;; cascade on :cardinality :many
                       (and
                        (= :ref (:value-type attr))
                        (= :many (:cardinality attr))
                        (= :cascade (:on-delete attr)))
                       (cascade-message fwd-name)

                       (and
                        (= :ref (:value-type attr))
                        (not (:unique? attr))
                        (= :cascade (:on-delete-reverse attr)))
                       (cascade-message rev-name))]
               :when message]
           {:in [:schema]
            :message message}))]
    errors))

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
              ;; backwards link
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
              ;; dup rev ident 1
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
              ;; dup rev ident 2
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
              ;; dup blob
              [:add-attr
               {:value-type :blob,
                :id "",
                :forward-identity
                ["" "posts" "name"],
                :cardinality :one,
                :unique? false,
                :index? false}]
              ;; this one's ok
              [:add-attr
               {:value-type :blob,
                :id "",
                :forward-identity
                ["" "posts" "content"],
                :cardinality :one,
                :unique? false,
                :index? false}]])
  (plan-errors current-attrs steps))

;; ---
;; API

(defn plan!
  [{:keys [app-id check-types? background-updates?]} client-defs]
  (let [new-schema (defs->schema client-defs)
        current-attrs (attr-model/get-by-app-id app-id)
        current-schema (attrs->schema current-attrs)
        steps (schemas->ops {:check-types? check-types?
                             :background-updates? background-updates?}
                            current-schema
                            new-schema)]
    (ex/assert-valid! :schema :plan (plan-errors current-attrs steps))
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
   true
   {:refs {}
    :blobs {:ns {:a {:unique? "one"}}}}
   {:refs {["comments" "post" "posts" "x"] {:unique? true :cardinality "one"}
           ["comments" "post" "posts" "comments"] {:unique? true :cardinality "one"}}
    :blobs {:ns {:a {:cardinality "many"} :b {:cardinality  "many"}}}})
  (schemas->ops
   true
   {:refs {}
    :blobs {:ns {:a {:unique? "one"}}}}
   {:refs {["comments" "post" "posts" "comments"] {:unique? true :cardinality "one"}}
    :blobs {:ns {:a {:cardinality "many"} :b {:cardinality  "many"}}}}))

(defn create-indexing-jobs [app-id job-steps]
  (let [group-id (random-uuid)
        jobs (mapv (fn [[action {:keys [attr-id checked-data-type]}]]
                     (let [job (case action
                                 :check-data-type (indexing-jobs/create-check-data-type-job!
                                                   {:app-id app-id
                                                    :group-id group-id
                                                    :attr-id attr-id
                                                    :checked-data-type checked-data-type})
                                 :remove-data-type (indexing-jobs/create-remove-data-type-job!
                                                    {:app-id app-id
                                                     :group-id group-id
                                                     :attr-id attr-id})
                                 :index (indexing-jobs/create-index-job!
                                         {:app-id app-id
                                          :group-id group-id
                                          :attr-id attr-id})
                                 :remove-index (indexing-jobs/create-remove-index-job!
                                                {:app-id app-id
                                                 :group-id group-id
                                                 :attr-id attr-id})
                                 :unique (indexing-jobs/create-unique-job!
                                          {:app-id app-id
                                           :group-id group-id
                                           :attr-id attr-id})
                                 :remove-unique (indexing-jobs/create-remove-unique-job!
                                                 {:app-id app-id
                                                  :group-id group-id
                                                  :attr-id attr-id}))]
                       (indexing-jobs/enqueue-job job)
                       (indexing-jobs/job->client-format job)))
                   job-steps)]
    {:group-id group-id
     :jobs jobs}))

(defn apply-plan! [app-id {:keys [steps] :as _plan}]
  (let [ctx {:admin? true
             :db {:conn-pool (aurora/conn-pool :write)}
             :app-id app-id
             :attrs (attr-model/get-by-app-id app-id)
             :datalog-query-fn d/query
             :rules (rule-model/get-by-app-id {:app-id app-id})}
        tx-steps (filter (fn [[action]]
                           (contains? #{:add-attr :update-attr} action))
                         steps)
        tx-res (when (seq tx-steps)
                 (permissioned-tx/transact! ctx tx-steps))
        job-steps (filter (fn [[action]]
                            (contains? #{:check-data-type :remove-data-type
                                         :index :remove-index
                                         :unique :remove-unique}
                                       action))
                          steps)
        jobs-res (when (seq job-steps)
                   (create-indexing-jobs app-id job-steps))]
    {:transaction tx-res
     :indexing-jobs jobs-res}))
