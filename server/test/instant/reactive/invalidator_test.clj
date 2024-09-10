(ns instant.reactive.invalidator-test
  (:require
   [clojure.test :as test :refer [deftest testing is]]
   [instant.reactive.invalidator :as inv]))

(def create-triple-changes
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
      false]}))

(def update-triple-changes
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
       "01a892b6f33fa54aa3e8056d49b790db"]}}))

(def delete-triple-changes
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
       "26833117de9ecb130a208c6da76eb18b"]}}))

(def create-ident-changes
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
      "id"]}))

(def create-attr-changes
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
      nil]}))

(def update-attr-changes
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
      :keyvalues ["a684c2ba-27af-4d54-8c02-68832b4566f0"]}}))

(def update-ident-changes
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
      :keyvalues ["2a6cc86d-2814-4dd7-b3b3-3029bdd335af"]}}))

(def delete-ident-changes
  '({:kind "delete",
     :schema "public",
     :table "idents",
     :oldkeys
     {:keynames ["id"],
      :keytypes ["uuid"],
      :keyvalues ["3d9fe1e5-f7cc-4c44-a4f2-0088fe28b119"]}}))

(def delete-attr-changes
  '({:kind "delete",
     :schema "public",
     :table "attrs",
     :oldkeys
     {:keynames ["id"],
      :keytypes ["uuid"],
      :keyvalues ["48c22b06-ecc8-4459-a3b4-3c0b640780b5"]}}))

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

(comment
  (test/run-tests *ns*))
