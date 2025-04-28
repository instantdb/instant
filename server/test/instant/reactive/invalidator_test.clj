(ns instant.reactive.invalidator-test
  (:require
   [clojure.string :as string]
   [clojure.test :as test :refer [deftest testing is]]
   [instant.data.resolvers :as resolvers]
   [instant.db.model.attr :as attr-model]
   [instant.db.transaction :as tx]
   [instant.fixtures :refer [with-zeneca-app]]
   [instant.jdbc.aurora :as aurora]
   [instant.reactive.invalidator :as inv]
   [instant.util.crypt :as crypt-util]
   [instant.util.json :refer [->json]]
   [instant.util.test :refer [wait-for]]))

(defn transform-change [{:keys [columnnames columntypes columnvalues] :as v1}]
  (merge (select-keys v1 [:schema :table])
         {:action (keyword (:kind v1))
          :columns (map (fn [name type value]
                          {:name name
                           :type type
                           :value value})
                        columnnames columntypes columnvalues)}
         (when-let [{:keys [keynames keytypes keyvalues]} (:oldkeys v1)]
           {:identity (map (fn [name type value]
                             {:name name
                              :type type
                              :value value})
                           keynames keytypes keyvalues)})))

(defn ->wal2jsonv2 [changes]
  (map transform-change changes))

(def create-triple-changes
  (->wal2jsonv2
   '({:kind "insert",
      :schema "public",
      :table "triples",
      :columnnames
      ["app_id"
       "entity_id"
       "attr_id"
       "value"
       "value_md5"
       "ea"
       "eav"
       "av"
       "ave"
       "vae"],
      :columntypes
      ["uuid"
       "uuid"
       "uuid"
       "jsonb"
       "text"
       "boolean"
       "boolean"
       "boolean"
       "boolean"
       "boolean"],
      :columnvalues
      ["7e2d83a2-5018-44b2-84d0-0ebf7134da6d"
       "7c6b379b-d841-46e1-8970-2da7e0cbc490"
       "a2f7b8b7-5c6f-4b8c-a7aa-2ba400336acb"
       "\"New Movie\""
       "01a892b6f33fa54aa3e8056d49b790db"
       true
       false
       false
       false
       false]}
     {:kind "insert",
      :schema "public",
      :table "triples",
      :columnnames
      ["app_id"
       "entity_id"
       "attr_id"
       "value"
       "value_md5"
       "ea"
       "eav"
       "av"
       "ave"
       "vae"],
      :columntypes
      ["uuid"
       "uuid"
       "uuid"
       "jsonb"
       "text"
       "boolean"
       "boolean"
       "boolean"
       "boolean"
       "boolean"],
      :columnvalues
      ["7e2d83a2-5018-44b2-84d0-0ebf7134da6d"
       "7c6b379b-d841-46e1-8970-2da7e0cbc490"
       "6a631008-d315-4bbd-8665-c92aed9abc9c"
       "1987"
       "d68a18275455ae3eaa2c291eebb46e6d"
       true
       false
       false
       false
       false]})))

(def update-triple-changes
  (->wal2jsonv2
   '({:kind "update",
      :schema "public",
      :table "triples",
      :columnnames
      ["app_id"
       "entity_id"
       "attr_id"
       "value"
       "value_md5"
       "ea"
       "eav"
       "av"
       "ave"
       "vae"],
      :columntypes
      ["uuid"
       "uuid"
       "uuid"
       "jsonb"
       "text"
       "boolean"
       "boolean"
       "boolean"
       "boolean"
       "boolean"],
      :columnvalues
      ["7e2d83a2-5018-44b2-84d0-0ebf7134da6d"
       "7c6b379b-d841-46e1-8970-2da7e0cbc490"
       "a2f7b8b7-5c6f-4b8c-a7aa-2ba400336acb"
       "\"Updated Movie3\""
       "26833117de9ecb130a208c6da76eb18b"
       true
       false
       false
       false
       false],
      :oldkeys
      {:keynames ["app_id" "entity_id" "attr_id" "value_md5"],
       :keytypes ["uuid" "uuid" "uuid" "text"],
       :keyvalues
       ["7e2d83a2-5018-44b2-84d0-0ebf7134da6d"
        "7c6b379b-d841-46e1-8970-2da7e0cbc490"
        "a2f7b8b7-5c6f-4b8c-a7aa-2ba400336acb"
        "01a892b6f33fa54aa3e8056d49b790db"]}})))

(def delete-triple-changes
  (->wal2jsonv2
   '({:kind "delete",
      :schema "public",
      :table "triples",
      :oldkeys
      {:keynames ["app_id" "entity_id" "attr_id" "value_md5"],
       :keytypes ["uuid" "uuid" "uuid" "text"],
       :keyvalues
       ["7e2d83a2-5018-44b2-84d0-0ebf7134da6d"
        "7c6b379b-d841-46e1-8970-2da7e0cbc490"
        "6a631008-d315-4bbd-8665-c92aed9abc9c"
        "d68a18275455ae3eaa2c291eebb46e6d"]}}
     {:kind "delete",
      :schema "public",
      :table "triples",
      :oldkeys
      {:keynames ["app_id" "entity_id" "attr_id" "value_md5"],
       :keytypes ["uuid" "uuid" "uuid" "text"],
       :keyvalues
       ["7e2d83a2-5018-44b2-84d0-0ebf7134da6d"
        "7c6b379b-d841-46e1-8970-2da7e0cbc490"
        "a2f7b8b7-5c6f-4b8c-a7aa-2ba400336acb"
        "26833117de9ecb130a208c6da76eb18b"]}})))

(def create-ident-changes
  (->wal2jsonv2
   '({:kind "insert",
      :schema "public",
      :table "idents",
      :columnnames ["id" "app_id" "attr_id" "etype" "label"],
      :columntypes ["uuid" "uuid" "uuid" "text" "text"],
      :columnvalues
      ["d3a14b35-7e3c-4a5d-ae45-bacba24bedc4"
       "935132de-8426-4972-ac65-ff5b4b79c504"
       "ea72edf9-036a-413b-9c72-2bf92ec137d3"
       "counters"
       "id"]})))

(def create-attr-changes
  (->wal2jsonv2
   '({:kind "insert",
      :schema "public",
      :table "attrs",
      :columnnames
      ["id"
       "app_id"
       "value_type"
       "cardinality"
       "is_unique"
       "is_indexed"
       "forward_ident"
       "reverse_ident"],
      :columntypes
      ["uuid" "uuid" "text" "text" "boolean" "boolean" "uuid" "uuid"],
      :columnvalues
      ["ea72edf9-036a-413b-9c72-2bf92ec137d3"
       "935132de-8426-4972-ac65-ff5b4b79c504"
       "blob"
       "one"
       false
       false
       "d3a14b35-7e3c-4a5d-ae45-bacba24bedc4"
       nil]})))

(def update-attr-changes
  (->wal2jsonv2
   '({:kind "update",
      :schema "public",
      :table "attrs",
      :columnnames
      ["id"
       "app_id"
       "value_type"
       "cardinality"
       "is_unique"
       "is_indexed"
       "forward_ident"
       "reverse_ident"],
      :columntypes
      ["uuid" "uuid" "text" "text" "boolean" "boolean" "uuid" "uuid"],
      :columnvalues
      ["a684c2ba-27af-4d54-8c02-68832b4566f0"
       "935132de-8426-4972-ac65-ff5b4b79c504"
       "blob"
       "one"
       false
       true
       "2a6cc86d-2814-4dd7-b3b3-3029bdd335af"
       nil],
      :oldkeys
      {:keynames ["id"],
       :keytypes ["uuid"],
       :keyvalues ["a684c2ba-27af-4d54-8c02-68832b4566f0"]}})))

(def update-ident-changes
  (->wal2jsonv2
   '({:kind "update",
      :schema "public",
      :table "idents",
      :columnnames ["id" "app_id" "attr_id" "etype" "label"],
      :columntypes ["uuid" "uuid" "uuid" "text" "text"],
      :columnvalues
      ["2a6cc86d-2814-4dd7-b3b3-3029bdd335af"
       "935132de-8426-4972-ac65-ff5b4b79c504"
       "a684c2ba-27af-4d54-8c02-68832b4566f0"
       "counters"
       "floopy"],
      :oldkeys
      {:keynames ["id"],
       :keytypes ["uuid"],
       :keyvalues ["2a6cc86d-2814-4dd7-b3b3-3029bdd335af"]}})))

(def delete-ident-changes
  (->wal2jsonv2
   '({:kind "delete",
      :schema "public",
      :table "idents",
      :oldkeys
      {:keynames ["id"],
       :keytypes ["uuid"],
       :keyvalues ["3d9fe1e5-f7cc-4c44-a4f2-0088fe28b119"]}})))

(def delete-attr-changes
  (->wal2jsonv2
   '({:kind "delete",
      :schema "public",
      :table "attrs",
      :oldkeys
      {:keynames ["id"],
       :keytypes ["uuid"],
       :keyvalues ["48c22b06-ecc8-4459-a3b4-3c0b640780b5"]}})))

(deftest changes-produce-correct-topics
  (testing "insert triples"
    (is (= #{[:ea
              #{#uuid "7c6b379b-d841-46e1-8970-2da7e0cbc490"}
              #{#uuid "a2f7b8b7-5c6f-4b8c-a7aa-2ba400336acb"}
              #{"New Movie"}]
             [:ea
              #{#uuid "7c6b379b-d841-46e1-8970-2da7e0cbc490"}
              #{#uuid "6a631008-d315-4bbd-8665-c92aed9abc9c"}
              #{1987}]}
           (inv/topics-for-changes {:triple-changes create-triple-changes}))))
  (testing "update triples"
    (is (= '#{[:ea
               #{#uuid "7c6b379b-d841-46e1-8970-2da7e0cbc490"}
               #{#uuid "a2f7b8b7-5c6f-4b8c-a7aa-2ba400336acb"}
               _]}
           (inv/topics-for-changes {:triple-changes update-triple-changes}))))
  (testing "update triples"
    (is (= '#{[:ave
               #{#uuid "7c6b379b-d841-46e1-8970-2da7e0cbc490"}
               #{#uuid "a2f7b8b7-5c6f-4b8c-a7aa-2ba400336acb"}
               _]
              [:eav
               #{#uuid "7c6b379b-d841-46e1-8970-2da7e0cbc490"}
               #{#uuid "a2f7b8b7-5c6f-4b8c-a7aa-2ba400336acb"}
               _]
              [:av
               #{#uuid "7c6b379b-d841-46e1-8970-2da7e0cbc490"}
               #{#uuid "a2f7b8b7-5c6f-4b8c-a7aa-2ba400336acb"}
               _]
              [:vae
               #{#uuid "7c6b379b-d841-46e1-8970-2da7e0cbc490"}
               #{#uuid "6a631008-d315-4bbd-8665-c92aed9abc9c"}
               _]
              [:eav
               #{#uuid "7c6b379b-d841-46e1-8970-2da7e0cbc490"}
               #{#uuid "6a631008-d315-4bbd-8665-c92aed9abc9c"}
               _]
              [:ave
               #{#uuid "7c6b379b-d841-46e1-8970-2da7e0cbc490"}
               #{#uuid "6a631008-d315-4bbd-8665-c92aed9abc9c"}
               _]
              [:ea
               #{#uuid "7c6b379b-d841-46e1-8970-2da7e0cbc490"}
               #{#uuid "6a631008-d315-4bbd-8665-c92aed9abc9c"}
               _]
              [:av
               #{#uuid "7c6b379b-d841-46e1-8970-2da7e0cbc490"}
               #{#uuid "6a631008-d315-4bbd-8665-c92aed9abc9c"}
               _]
              [:ea
               #{#uuid "7c6b379b-d841-46e1-8970-2da7e0cbc490"}
               #{#uuid "a2f7b8b7-5c6f-4b8c-a7aa-2ba400336acb"}
               _]
              [:vae
               #{#uuid "7c6b379b-d841-46e1-8970-2da7e0cbc490"}
               #{#uuid "a2f7b8b7-5c6f-4b8c-a7aa-2ba400336acb"}
               _]}
           (inv/topics-for-changes {:triple-changes delete-triple-changes}))))
  (testing "create attrs + idents (these happen together)"
    (is (= '#{[:ave _ #{#uuid "ea72edf9-036a-413b-9c72-2bf92ec137d3"} _]
              [:eav _ #{#uuid "ea72edf9-036a-413b-9c72-2bf92ec137d3"} _]
              [:vae _ #{#uuid "ea72edf9-036a-413b-9c72-2bf92ec137d3"} _]
              [:av _ #{#uuid "ea72edf9-036a-413b-9c72-2bf92ec137d3"} _]
              [:ea _ #{#uuid "ea72edf9-036a-413b-9c72-2bf92ec137d3"} _]}
           (inv/topics-for-changes {:ident-changes create-ident-changes
                                    :attr-changes create-attr-changes}))))
  (testing "update idents isolated"
    (is (= '#{[:av _ #{#uuid "a684c2ba-27af-4d54-8c02-68832b4566f0"} _]
              [:ea _ #{#uuid "a684c2ba-27af-4d54-8c02-68832b4566f0"} _]
              [:eav _ #{#uuid "a684c2ba-27af-4d54-8c02-68832b4566f0"} _]
              [:vae _ #{#uuid "a684c2ba-27af-4d54-8c02-68832b4566f0"} _]
              [:ave _ #{#uuid "a684c2ba-27af-4d54-8c02-68832b4566f0"} _]}
           (inv/topics-for-changes {:ident-changes update-ident-changes}))))
  (testing "update attrs isolated"
    (is (= '#{[:av _ #{#uuid "a684c2ba-27af-4d54-8c02-68832b4566f0"} _]
              [:ea _ #{#uuid "a684c2ba-27af-4d54-8c02-68832b4566f0"} _]
              [:eav _ #{#uuid "a684c2ba-27af-4d54-8c02-68832b4566f0"} _]
              [:vae _ #{#uuid "a684c2ba-27af-4d54-8c02-68832b4566f0"} _]
              [:ave _ #{#uuid "a684c2ba-27af-4d54-8c02-68832b4566f0"} _]}
           (inv/topics-for-changes {:attr-changes update-attr-changes}))))
  (testing "update attr + idents"
    (is (= '#{[:av _ #{#uuid "a684c2ba-27af-4d54-8c02-68832b4566f0"} _]
              [:ea _ #{#uuid "a684c2ba-27af-4d54-8c02-68832b4566f0"} _]
              [:eav _ #{#uuid "a684c2ba-27af-4d54-8c02-68832b4566f0"} _]
              [:vae _ #{#uuid "a684c2ba-27af-4d54-8c02-68832b4566f0"} _]
              [:ave _ #{#uuid "a684c2ba-27af-4d54-8c02-68832b4566f0"} _]}
           (inv/topics-for-changes {:ident-changes update-ident-changes
                                    :attr-changes update-attr-changes}))))
  (testing "delete attr + idents (these happen together)"
    (is (= '#{[:ea _ #{#uuid "48c22b06-ecc8-4459-a3b4-3c0b640780b5"} _]
              [:vae _ #{#uuid "48c22b06-ecc8-4459-a3b4-3c0b640780b5"} _]
              [:ave _ #{#uuid "48c22b06-ecc8-4459-a3b4-3c0b640780b5"} _]
              [:eav _ #{#uuid "48c22b06-ecc8-4459-a3b4-3c0b640780b5"} _]
              [:av _ #{#uuid "48c22b06-ecc8-4459-a3b4-3c0b640780b5"} _]}
           (inv/topics-for-changes {:ident-changes delete-ident-changes
                                    :attr-changes delete-attr-changes})))))

(defn ->md5 [s]
  (-> s
      crypt-util/str->md5
      crypt-util/bytes->hex-string))

(defn xform-change [{:keys [columns]}]
  (zipmap (map :name columns) (map :value columns)))

(deftest smoke-test
  (with-zeneca-app
    (fn [app r]
      (let [invalidate! (var-get #'inv/invalidate!)
            records (atom [])
            machine-id (string/replace (str "test-" (random-uuid))
                                       #"-"
                                       "_")]
        (with-redefs [inv/invalidate!
                      (fn [process-id store {:keys [app-id] :as wal-record}]
                        (if (and (= machine-id process-id) (= (:id app) app-id))
                          (swap! records conj wal-record)
                          (invalidate! process-id store wal-record)))]
          (let [process (inv/start machine-id)
                uid (random-uuid)]
            (try
              (tx/transact! (aurora/conn-pool :write)
                            (attr-model/get-by-app-id (:id app))
                            (:id app)
                            [[:add-triple uid (resolvers/->uuid r :users/id) uid]
                             [:add-triple uid (resolvers/->uuid r :users/handle) "dww"]])
              (wait-for (fn []
                          (< 0 (count @records)))
                        1000)
              (is (= 1 (count @records)))
              (let [rec (first @records)]
                (is (pos? (:tx-id rec)))
                (is (= (set (map (fn [change]
                                   (-> change
                                       xform-change
                                       (dissoc "created_at")))
                                 (:triple-changes rec)))
                       #{{"eav" false,
                          "av" true,
                          "ave" true,
                          "value_md5" "057a88732b390295a8623cfd3cb799d9",
                          "entity_id" (str uid)
                          "attr_id" (str (resolvers/->uuid r :users/handle))
                          "ea" true,
                          "value" "\"dww\"",
                          "vae" false,
                          "app_id" (str (:id app))
                          "checked_data_type" nil}
                         {"eav" false,
                          "av" true,
                          "ave" false,
                          "value_md5" (->md5 (->json (str uid)))
                          "entity_id" (str uid)
                          "attr_id" (str (resolvers/->uuid r :users/id))
                          "ea" true,
                          "value" (->json (str uid))
                          "vae" false,
                          "app_id" (str (:id app))
                          "checked_data_type" nil}
                         ;; null that is automatically inserted for the
                         ;; indexed blob attr
                         {"eav" false,
                          "av" true,
                          "ave" true,
                          "value_md5" "37a6259cc0c1dae299a7866489dff0bd",
                          "entity_id" (str uid)
                          "attr_id" (str (resolvers/->uuid r :users/email))
                          "ea" true,
                          "value" "null",
                          "checked_data_type" nil,
                          "vae" false,
                          "app_id" (str (:id app))}})))

              (finally
                (inv/stop process)))))))))

(comment
  (test/run-tests *ns*))
