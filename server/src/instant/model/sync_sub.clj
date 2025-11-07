(ns instant.model.sync-sub
  (:require
   [clojure.set]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.util.coll :as ucoll]
   [instant.util.crypt :as crypt-util]
   [instant.util.exception :as ex]
   [instant.util.hsql :as uhsql]
   [instant.util.json :as json]
   [instant.util.uuid :as uuid-util]))

(defn topic-uuids
  "Converts from our pg byte representation to our topic representation.

  In pg '_ is an array with one empty byte, #{uuid1, uuid2} is an array of
  uuids converted to bytes."
  [db-res]
  (if (= db-res ["\\x"])
    '_
    (ucoll/reduce-tr
     (fn [acc v]
       (conj! acc (-> v
                      (subs 2) ;; remove \\x prefix
                      crypt-util/hex-string->bytes
                      uuid-util/<-bytes)))
     #{}
     db-res)))

(defn xform-topic
  "Converts topics from our pg representation to our default topic representation.

  For UUIDs:
  In pg '_ is an array with one empty byte, #{uuid1, uuid2} is an array of
  uuids converted to bytes.

  For values:
  In pg '_ is an array with a single {}, #{v1, v2} is an array of json.
  If the field has a function, then we add {} and serialized the functions
  into a single jsonb array in v_filter."
  [topic]
  (let [{:strs [idx e a v v_filter]} topic
        idx-key (keyword (first idx))
        topic-idx (if (= idx-key :any)
                    '_
                    idx-key)
        e (topic-uuids e)
        a (topic-uuids a)
        func-v (map #(json/->json (json/<-json %) true)
                    v_filter)
        v (if (= v [{}])
            (if (seq func-v)
              (set func-v)
              '_)
            (into (disj (set v) {})
                  func-v))]
    [topic-idx e a v]))

(defn xform-topics [topics]
  (ucoll/reduce-tr (fn [acc topic]
                     (conj! acc (xform-topic topic)))
                   #{}
                   topics))

(defn xform-row [row]
  (-> row
      (clojure.set/rename-keys {:app_id :app-id
                                :sent_tx_id :sent-tx-id
                                :token_hash :token-hash
                                :is_admin :admin?
                                :user_id :user-id})
      (ucoll/update-when :topics xform-topics)))

(defn add-topic-params
  "Given a list of topics, adds topic-num, idx, e, a, v, and v-filter
   params to the query params."
  [params topics]
  (reduce-kv (fn [acc topic-num [idx e a v]]
               (-> acc
                   (update :topic-num conj topic-num)
                   (update :idx conj [(name idx)])
                   (update :e conj (if (= e '_)
                                     [(byte-array 0)]
                                     (mapv uuid-util/->bytes e)))
                   (update :a conj (if (= a '_)
                                     [(byte-array 0)]
                                     (mapv uuid-util/->bytes a)))
                   (update :v conj (if (= v '_)
                                     [{}]
                                     (mapv (fn [val]
                                             ;; If we get a map, then it's something like {:$isNull true}
                                             ;; We'll mark that as any and add it to v-filters
                                             (if (map? val)
                                               {}
                                               val))
                                           v)))
                   (update :v-filter conj (if (= v '_)
                                            nil
                                            (not-empty (filter map? v))))))
             (assoc params
                    :topic-num (with-meta [] {:pgtype "integer[]"})
                    :idx (with-meta [] {:pgtype "text[][]"})
                    :e (with-meta [] {:pgtype "bytea[][]"})
                    :a (with-meta [] {:pgtype "bytea[][]"})
                    :v (with-meta [] {:pgtype "jsonb[][]"})
                    :v-filter (with-meta [] {:pgtype "jsonb[]"}))
             (vec topics)))

(def topic-cols [:sync-sub-id :topic-num :idx :e :a :v :v-filter])

(def create-q (uhsql/preformat {:with [[:sync-sub {:insert-into :sync-subs
                                                   :values [{:id :?id
                                                             :app-id :?app-id
                                                             :query :?query
                                                             :sent-tx-id :?tx-id
                                                             :token-hash :?token-hash
                                                             :is-admin :?admin?
                                                             :user-id :?user-id}]
                                                   :returning :*}]
                                       [:data {:select [[:?id :sync-sub-id]
                                                        [[:unnest :?topic-num] :topic-num]
                                                        [[:cast [:unnest_2d :?idx] (keyword "topics_idx[][]")] :idx]
                                                        [[:unnest_2d :?e] :e]
                                                        [[:unnest_2d :?a] :a]
                                                        [[:unnest_2d :?v] :v]
                                                        [[:unnest :?v-filter] :v-filter]]}]
                                       [:topics {:insert-into [[:sync_sub_topics topic-cols]
                                                               {:select topic-cols
                                                                :from :data}]}]]
                                :select :*
                                :from :sync-sub}))

(defn create!
  "Creates the sub and inserts the inital topics. Returns the sub with token.
  The token is used to resubscribe to the subscription on reconnect."
  ([params] (create! (aurora/conn-pool :write) params))
  ([conn {:keys [id app-id query user-id admin? token tx-id topics]}]
   (let [params (add-topic-params {:id id
                                   :tx-id tx-id
                                   :token-hash (crypt-util/uuid->sha256 token)
                                   :app-id app-id
                                   :query query
                                   :admin? (boolean admin?)
                                   :user-id user-id}
                                  topics)]
     (-> (sql/execute-one! ::create! conn (uhsql/formatp create-q params))
         xform-row
         (assoc :token token)))))

(def delete-q (uhsql/preformat {:delete-from :sync-subs
                                :where [:and
                                        [:= :app-id :?app-id]
                                        [:= :id :?id]]}))

(defn delete!
  "Deletes the sub and all of its topics."
  ([params] (delete! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id id]}]
   (sql/execute-one! ::delete! conn (uhsql/formatp delete-q {:id id
                                                             :app-id app-id}))))

(def get-by-id-with-topics-q
  (uhsql/preformat {:select [:* [{:select [[[:json_agg [:row_to_json :t]]]]
                                  :from [[{:select [:idx :e :a :v :v-filter]
                                           :from :sync_sub_topics
                                           :where [:= :sync_sub_id :?id]} :t]]}
                                 :topics]]
                    :from :sync-subs
                    :where [:= :id :?id]}))

(defn get-by-id-with-topics!
  "Gets the sub along with its topics.
   Will throw a validation error if the user is different or if it was an admin before and isn't now."
  ([params] (get-by-id-with-topics! (aurora/conn-pool :read) params))
  ([conn {:keys [id token admin? user-id]}]
   (let [record (-> (sql/select-one ::get-by-id-with-topics
                                    conn
                                    (uhsql/formatp get-by-id-with-topics-q {:id id}))
                    (ex/assert-record! :subscription {:subscription-id id})
                    xform-row)]
     (when (not (crypt-util/constant-bytes= (:token-hash record)
                                            (crypt-util/uuid->sha256 token)))
       (ex/throw-validation-err! :subscription
                                 {:token token}
                                 [{:message "Invalid token."}]))
     (when (not= (boolean admin?) (:admin? record))
       (ex/throw-validation-err! :subscription
                                 {:admin? admin?}
                                 [{:message (if admin?
                                              "Subscription was not created by an admin, but the session is an admin session."
                                              "Subscription was created as an admin, but the session is not an admin session.")}]))
     (when (not= user-id (:user-id record))
       (ex/throw-validation-err! :subscription
                                 {:user-id user-id}
                                 [{:message "Subscription was created by a different user."}]))
     record)))
