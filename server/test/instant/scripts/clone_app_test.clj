(ns instant.scripts.clone-app-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [instant.fixtures :refer [with-user with-zeneca-app]]
   [instant.jdbc.aurora :as aurora]
   [instant.model.app :as app-model]
   [instant.db.model.attr :as attr-model]
   [instant.db.model.triple :as triple-model]
   [instant.model.rule :as rule-model]
   [instant.scripts.clone-app :as clone-app]
   [instant.util.coll :as coll]))

(defn- normalize-attr [attr]
  (-> attr
      (update :forward-identity attr-model/ident-name)
      (coll/update-in-when [:reverse-identity] attr-model/ident-name)
      (dissoc :id)))

(deftest clone-app-copies-data
  (with-user
    (fn [temporary-user]
      (with-user
        (fn [dest-user]
          (with-zeneca-app
            (fn [{source-app-id :id} _resolver]
              (let [conn (aurora/conn-pool :write)
                    dest-title (str "clone-app-test-" (random-uuid))
                    rules {"users" {"allow" {"view" "true"}}}
                    _ (rule-model/put! {:app-id source-app-id :code rules})
                    source-rule (:code (rule-model/get-by-app-id {:app-id source-app-id}))
                    source-triples (triple-model/fetch conn source-app-id)
                    source-attrs (attr-model/get-by-app-id source-app-id)
                    source-attr (attr-model/seek-by-fwd-ident-name ["users" "handle"] source-attrs)
                    source-attr-count (count (triple-model/fetch conn source-app-id
                                                                 [[:= :attr-id (:id source-attr)]]))
                    dest-app (clone-app/clone-app! conn {:source-app-id source-app-id
                                                         :temporary-creator-id (:id temporary-user)
                                                         :dest-creator-id (:id dest-user)
                                                         :dest-title dest-title
                                                         :num-workers 2
                                                         :batch-size 100})
                    dest-app-id (:id dest-app)
                    dest-rule (:code (rule-model/get-by-app-id {:app-id dest-app-id}))
                    dest-triples (triple-model/fetch conn dest-app-id)
                    dest-attrs (attr-model/get-by-app-id dest-app-id)
                    dest-attr (attr-model/seek-by-fwd-ident-name
                               (attr-model/fwd-ident-name source-attr)
                               dest-attrs)
                    dest-attr-count (count (triple-model/fetch conn dest-app-id
                                                               [[:= :attr-id (:id dest-attr)]]))]
                (try
                  (testing "copies triples"
                    (is (= (count source-triples)
                           (count dest-triples))))

                  (testing "copies rules"
                    (is (= source-rule dest-rule)))

                  (testing "copies attr shape and counts"
                    (is (= (normalize-attr source-attr)
                           (normalize-attr dest-attr)))
                    (is (= source-attr-count dest-attr-count)))

                  (testing "sets destination creator"
                    (is (= (:id dest-user) (:creator_id dest-app))))

                  (finally
                    (when dest-app-id
                      (app-model/delete-immediately-by-id! {:id dest-app-id}))))))))))))
