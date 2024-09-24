(ns instant.admin.model
  "Context:

   Internally, we process transactions as `tx-steps`. The model for that is in
   `instant.db.transaction`, and looks like:

   [[:add-triple eid ...]
    [:retract-triple eid ..]]

   However, when users make POST requests through the admin API, we take a different
   structure. It looks something like:

   [[\"update\" \"goals\" (str-uuid) {\"title\" \"moop\"}]
    [\"link\" \"goals\" (str-uuid) {\"todos\" (str-uuid)}]
    ...]

   This namespace transforms the user-facing `steps` to the internal `tx-steps`."
  (:require
   [instant.db.model.attr :as attr-model]
   [instant.db.model.triple :as triple-model]
   [clojure.walk :as w]
   [clojure.spec.alpha :as s]
   [clojure.string :as string]
   [instant.util.exception :as ex]
   [instant.db.transaction :as tx]
   [instant.jdbc.aurora :as aurora]
   [instant.util.json :refer [->json <-json]])
  (:import
   (java.util UUID)))

(defn lookup? [eid]
  (and (string? eid)
       (.startsWith eid "lookup__")))

(defn parse-lookup [^String k]
  (let [[_ eid & json-parts] (.split k "__")]
    [eid (<-json (string/join "__" json-parts))]))

(defn explode-lookup [eid]
  (if (sequential? eid)
    eid
    (if (= 1 (count eid))
      (first eid)
      (ex/throw-validation-err!
       :lookup
       eid
       [{:message "lookup must be an object with a single unique attr and value."}]))))

(defn eid->lookup-pair
  "Extract the [label, value] from a lookup, returns nil if eid isn't a lookup"
  [eid]
  (if (string? eid)
    (when (lookup? eid)
      (parse-lookup eid))
    (explode-lookup eid)))

(defn ref-lookup? [attrs etype [ident-name _value]]
  ;; attr names can have `.` in them, so check for the attr with a `.` before
  ;; assuming it's a ref
  (and (not= (.indexOf ident-name ".") -1)
       (not (attr-model/seek-by-fwd-ident-name [etype ident-name] attrs))))

(defn extract-ref-lookup-fwd-name [lookup]
  (let [[ident-name _value] lookup
        [fwdName idIdent & more] (string/split ident-name #"\.")]
    (when (or (seq more) (not= idIdent "id"))
      (ex/throw-validation-err!
       :lookup
       lookup
       [{:message (str ident-name " is not a valid lookup attribute.")}]))
    fwdName))

(defn extract-lookup [attrs etype eid]
  (if-let [[ident-name value :as lookup] (eid->lookup-pair eid)]
    (let [label (if (ref-lookup? attrs etype lookup)
                  (extract-ref-lookup-fwd-name lookup)
                  ident-name)
          attr (attr-model/seek-by-fwd-ident-name [etype label] attrs)]
      (when (not (:unique? attr))
        (ex/throw-validation-err!
         :lookup
         eid
         [{:message (str ident-name " is not a unique attribute on " etype)}]))
      [(:id attr) value])
    eid))

(defn expand-link [attrs [etype eid-a obj]]
  (mapcat (fn [[label eid-or-eids]]
            (let [fwd-attr (attr-model/seek-by-fwd-ident-name [etype label] attrs)
                  rev-attr (attr-model/seek-by-rev-ident-name [etype label] attrs)
                  eid-bs (if (coll? eid-or-eids) eid-or-eids [eid-or-eids])
                  tx-steps (map (fn [eid-b]
                                  (if fwd-attr
                                    [:add-triple
                                     (extract-lookup attrs etype eid-a)
                                     (:id fwd-attr)
                                     (extract-lookup attrs
                                                     (-> fwd-attr
                                                         :reverse-identity
                                                         second)
                                                     eid-b)]
                                    [:add-triple
                                     (extract-lookup attrs
                                                     (-> rev-attr
                                                         :forward-identity
                                                         second)
                                                     eid-b)
                                     (:id rev-attr)
                                     (extract-lookup attrs etype eid-a)]))
                                eid-bs)]

              tx-steps))
          obj))

(defn expand-unlink [attrs [etype eid-a obj]]
  (mapcat (fn [[label eid-or-eids]]
            (let [fwd-attr (attr-model/seek-by-fwd-ident-name [etype label] attrs)
                  rev-attr (attr-model/seek-by-rev-ident-name [etype label] attrs)
                  eid-bs (if (coll? eid-or-eids) eid-or-eids [eid-or-eids])
                  tx-steps (map (fn [eid-b]
                                  (if fwd-attr
                                    [:retract-triple
                                     (extract-lookup attrs etype eid-a)
                                     (:id fwd-attr)
                                     (extract-lookup attrs
                                                     (-> fwd-attr
                                                         :reverse-identity
                                                         second)
                                                     eid-b)]
                                    [:retract-triple
                                     (extract-lookup attrs
                                                     (-> rev-attr
                                                         :forward-identity
                                                         second)
                                                     eid-b)
                                     (:id rev-attr)
                                     (extract-lookup attrs etype eid-a)]))
                                eid-bs)]
              tx-steps))
          obj))

(defn expand-update [attrs [etype eid obj]]
  (let [lookup (extract-lookup attrs etype eid)]
    (map (fn [[label value]]
           (let [attr (attr-model/seek-by-fwd-ident-name [etype label] attrs)]
             [:add-triple lookup (:id attr) value]))
         ;; id first so that we don't clobber updates on the lookup field
         (concat [["id" lookup]] obj))))

(defn expand-merge [attrs [etype eid obj]]
  (let [lookup (extract-lookup attrs etype eid)]
    (map (fn [[label value]]
           (let [attr (attr-model/seek-by-fwd-ident-name [etype label] attrs)
                 op (if (= label "id") :add-triple :deep-merge-triple)]
             [op lookup (:id attr) value]))
         ;; id first so that we don't clobber updates on the lookup field
         (concat [["id" lookup]] obj))))

(defn expand-delete [attrs [etype eid]]
  (let [lookup (extract-lookup attrs etype eid)]
    [[:delete-entity lookup etype]]))

(defn expand-add-attr [_ [attr]]
  [[:add-attr (-> attr
                  w/keywordize-keys
                  (update :cardinality keyword)
                  (update :value-type keyword))]])

(defn expand-delete-attr [_ [id]]
  [[:delete-attr id]])

(defn remove-id-from-step [[op etype eid obj]]
  [op etype eid (dissoc obj "id")])

(defn to-tx-steps [attrs step]
  (let [[action & args] (remove-id-from-step step)]
    (case action
      "update" (expand-update attrs args)
      "merge" (expand-merge attrs args)
      "link"   (expand-link attrs args)
      "unlink" (expand-unlink attrs args)
      "delete" (expand-delete attrs args)
      "add-attr" (expand-add-attr attrs args)
      "delete-attr" (expand-delete-attr attrs args)
      (throw (ex-info (str "unsupported action " action) {})))))

(defn create-object-attr
  ([etype label] (create-object-attr etype label nil))
  ([etype label props]
   (let [attr-id (UUID/randomUUID)
         fwd-ident-id (UUID/randomUUID)
         fwd-ident [fwd-ident-id etype label]]
     (merge {:id attr-id
             :forward-identity fwd-ident
             :value-type :blob
             :cardinality :one
             :unique? false
             :index? false}
            props))))

(defn create-ref-attr
  ([etype label] (create-ref-attr etype label nil))
  ([etype label props]
   (let [attr-id (UUID/randomUUID)
         fwd-ident-id (UUID/randomUUID)
         rev-ident-id (UUID/randomUUID)
         fwd-ident [fwd-ident-id etype label]
         rev-ident [rev-ident-id label etype]]
     (merge {:id attr-id
             :forward-identity fwd-ident
             :reverse-identity rev-ident
             :value-type :ref
             :cardinality :many
             :unique? false
             :index? false}
            props))))

(def obj-actions #{"link" "unlink" "update" "merge"})
(def update-actions #{"update", "merge"})
(def ref-actions #{"link" "unlink"})
(def supports-lookup-actions #{"link" "unlink" "update" "merge" "delete"})

(defn add-attr [{:keys [attrs add-ops]} attr]
  {:attrs (conj attrs attr)
   :add-ops (conj add-ops [:add-attr attr])})

(defn add-attrs-for-obj [acc op]
  (let [[action etype _eid obj] op
        labels (conj (keys obj) "id")]
    (reduce (fn [{:keys [attrs] :as acc} label]
              (let [fwd-attr (attr-model/seek-by-fwd-ident-name [etype label] attrs)
                    rev-attr (when (contains? ref-actions action)
                               (attr-model/seek-by-rev-ident-name [etype label] attrs))]
                (cond (and (contains? update-actions action)
                           (not fwd-attr))
                      (add-attr acc (create-object-attr etype label))

                      (and (contains? ref-actions action)
                           (not fwd-attr)
                           (not rev-attr))
                      (add-attr acc (create-ref-attr etype label))

                      :else acc)))
            acc
            labels)))

(defn add-attrs-for-lookup [{:keys [attrs] :as acc} lookup etype]
  (if (ref-lookup? attrs etype lookup)
    (let [label (extract-ref-lookup-fwd-name lookup)
          fwd-attr (attr-model/seek-by-fwd-ident-name [etype label] attrs)
          rev-attr (attr-model/seek-by-fwd-ident-name [etype label] attrs)]
      (if (and (not fwd-attr) (not rev-attr))
        (add-attr acc (create-ref-attr etype
                                       label
                                       {:unique? true
                                        :index? true
                                        :cardinality :one}))
        acc))
    (let [[label _value] lookup]
      (if (attr-model/seek-by-fwd-ident-name [etype label]
                                             attrs)
        acc
        (add-attr acc (create-object-attr etype
                                          label
                                          {:unique? true
                                           :index? true}))))))

(defn create-lookup-attrs [acc ops]
  (reduce (fn [acc op]
            (let [[action etype eid _obj] op]
              (if-let [lookup (when (contains? supports-lookup-actions action)
                                (eid->lookup-pair eid))]
                (add-attrs-for-lookup acc lookup etype)
                acc)))
          acc
          ops))

(defn create-attrs-from-objs [acc ops]
  (reduce (fn [acc op]
            (let [[action _etype _eid _obj] op]
              (if (contains? obj-actions action)
                (add-attrs-for-obj acc op)
                acc)))
          acc
          ops))

(defn create-missing-attrs [attrs ops]
  (-> {:attrs attrs
       :add-ops []}
      (create-lookup-attrs ops)
      (create-attrs-from-objs ops)))

(defn transform [attrs steps]
  (let [{attrs :attrs add-attr-tx-steps :add-ops} (create-missing-attrs attrs steps)
        tx-steps (mapcat (fn [step] (to-tx-steps attrs step)) steps)]
    (concat add-attr-tx-steps tx-steps)))

(defn coercible-uuid? [x]
  (or (uuid? x) (and (string? x) (parse-uuid x))))

(s/def ::lookup-ref (s/or :vec (s/tuple string? triple-model/value?)
                          :map map?
                          :encoded-lookup lookup?))

(s/def ::lookup (s/or :entity-id coercible-uuid?
                      :lookup-ref ::lookup-ref))

(s/def ::update-op
  (s/cat :op #{"update"} :args (s/cat :etype string? :eid ::lookup :args map?)))

(s/def ::merge-op
  (s/cat :op #{"merge"} :args (s/cat :etype string? :eid ::lookup :args map?)))

(s/def ::link-value (s/or :eid ::lookup :eids (s/coll-of ::lookup)))

(s/def ::link-map (s/map-of string? ::link-value))

(s/def ::link-op
  (s/cat :op #{"link"} :args (s/cat :etype string? :eid ::lookup :args ::link-map)))

(s/def ::unlink-op
  (s/cat :op #{"unlink"} :args (s/cat :etype string? :eid ::lookup :args ::link-map)))

(s/def ::delete-op
  (s/cat :op #{"delete"} :args (s/cat :etype string? :eid ::lookup :remaining-args (s/* (constantly true)))))

(s/def ::add-attr-op
  (s/cat :op #{"add-attr"} :attr map?))

(s/def ::update-attr-op
  ;; Not being too specific about the _type_ of `attr` here. 
  ;; This is because we eventually validate `tx-steps`, 
  ;; which will validate more strictly
  (s/cat :op #{"update-attr"} :attr map?))

(s/def ::delete-attr-op
  (s/cat :op #{"delete-attr"} :eid coercible-uuid?))

(s/def ::op (s/or
             :update ::update-op
             :merge ::merge-op
             :link ::link-op
             :unlink ::unlink-op
             :delete ::delete-op
             :add-attr ::add-attr-op
             :update-attr ::update-attr-op
             :delete-attr ::delete-attr-op))

(s/def ::ops (s/coll-of ::op))

(defn- str-uuid []
  (str (UUID/randomUUID)))

(defn ->tx-steps!
  [attrs steps]
  (let [coerced-admin-steps (<-json (->json steps) false)
        valid? (s/valid? ::ops coerced-admin-steps)
        _ (when-not valid?
            (ex/throw-validation-err!
             :steps
             steps
             (ex/explain->validation-errors
              (s/explain-data ::ops steps))))
        tx-steps (transform attrs coerced-admin-steps)
        coerced (tx/coerce! tx-steps)
        _ (tx/validate! coerced)]
    coerced))

(comment
  (def counters-app-id  #uuid "b502cabc-11ed-4534-b340-349d46548642")
  (def attrs (attr-model/get-by-app-id aurora/conn-pool counters-app-id))
  (->tx-steps! attrs [["merge" "goals" (str-uuid) {"title" "plop"}]])
  (->tx-steps! attrs
               [["update" "goals" (str-uuid) {"title" "moop"}]
                ["link" "goals" (str-uuid) {"todos" (str-uuid)}]
                ["unlink" "goals" (str-uuid) {"todos" (str-uuid)}]
                ["delete" "goals" (str-uuid)]
                ["add-attr" {:id (str-uuid)
                             :forward-identity [(str-uuid) "goals" "title"]
                             :value-type "blob"
                             :cardinality "one"
                             :unique? false
                             :index? false}]]))
