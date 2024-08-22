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

(defn extract-lookup [attrs etype eid]
  (if (and (string? eid)
           (not (lookup? eid)))
    eid

    (let [[ident-name value] (if (lookup? eid)
                               (parse-lookup eid)
                               (explode-lookup eid))
          attr (attr-model/seek-by-fwd-ident-name [etype ident-name] attrs)]
      (when (not (:unique? attr))
        (ex/throw-validation-err!
         :lookup
         eid
         [{:message (str ident-name " is not a unique attribute on " etype)}]))
      [(:id attr) value])))

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
         (concat obj [["id" lookup]]))))

(defn expand-merge [attrs [etype eid obj]]
  (let [lookup (extract-lookup attrs etype eid)]
    (map (fn [[label value]]
           (let [attr (attr-model/seek-by-fwd-ident-name [etype label] attrs)
                 op (if (= label "id") :add-triple :deep-merge-triple)]
             [op lookup (:id attr) value]))
         (concat obj [["id" lookup]]))))

(defn expand-delete [attrs [etype eid]]
  (let [lookup (extract-lookup attrs etype eid)]
    [[:delete-entity lookup]]))

(defn expand-add-attr [_ [attr]]
  [[:add-attr (-> attr
                  w/keywordize-keys
                  (update :cardinality keyword)
                  (update :value-type keyword))]])

(defn expand-delete-attr [_ [id]]
  [[:delete-attr id]])

(defn to-tx-steps [attrs [action & args]]
  (case action
    "update" (expand-update attrs args)
    "merge" (expand-merge attrs args)
    "link"   (expand-link attrs args)
    "unlink" (expand-unlink attrs args)
    "delete" (expand-delete attrs args)
    "add-attr" (expand-add-attr attrs args)
    "delete-attr" (expand-delete-attr attrs args)
    (throw (ex-info (str "unsupported action " action) {}))))

(defn extract-ident-names [[_action etype _eid obj]]
  (let [ks (set (concat (keys obj) ["id"]))]
    (map (fn [label] [etype label]) ks)))

(defn create-object-attr [[etype label]]
  (let [attr-id (UUID/randomUUID)
        fwd-ident-id (UUID/randomUUID)
        fwd-ident [fwd-ident-id etype label]]
    {:id attr-id
     :forward-identity fwd-ident
     :value-type :blob
     :cardinality :one
     :unique? false
     :index? false}))

(defn create-ref-attr [[etype label]]
  (let [attr-id (UUID/randomUUID)
        fwd-ident-id (UUID/randomUUID)
        rev-ident-id (UUID/randomUUID)
        fwd-ident [fwd-ident-id etype label]
        rev-ident [rev-ident-id label etype]]
    {:id attr-id
     :forward-identity fwd-ident
     :reverse-identity rev-ident
     :value-type :ref
     :cardinality :many
     :unique? false
     :index? false}))

(defn create-missing-object-attrs [attrs ops]
  (let [object-ops (filter #(contains? #{"update" "merge"} (first %)) ops)
        object-idents (set (mapcat extract-ident-names object-ops))
        missing-idents (remove #(attr-model/seek-by-fwd-ident-name % attrs) object-idents)
        object-attrs (map create-object-attr missing-idents)
        new-attrs (concat attrs object-attrs)
        attr-tx-steps (map (fn [attr] [:add-attr attr]) object-attrs)]
    [new-attrs attr-tx-steps]))

(defn create-missing-ref-attrs [attrs ops]
  (let [object-ops (filter #(or (= "link" (first %)) (= "unlink" (first %))) ops)
        object-idents (set (mapcat extract-ident-names object-ops))
        missing-idents (remove #(or (attr-model/seek-by-fwd-ident-name % attrs)
                                    (attr-model/seek-by-rev-ident-name % attrs))
                               object-idents)
        ref-attrs (map create-ref-attr missing-idents)
        new-attrs (concat attrs ref-attrs)
        attr-tx-steps (map (fn [attr] [:add-attr attr]) ref-attrs)]
    [new-attrs attr-tx-steps]))

(defn transform [attrs steps]
  (let [[with-new-obj-attrs add-obj-attr-tx-steps] (create-missing-object-attrs attrs steps)
        [with-new-ref-attrs add-ref-attr-tx-steps] (create-missing-ref-attrs with-new-obj-attrs steps)
        tx-steps (mapcat (fn [step] (to-tx-steps with-new-ref-attrs step)) steps)]
    (concat add-obj-attr-tx-steps add-ref-attr-tx-steps tx-steps)))

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
