(ns instant.db.indexing-jobs-test
  (:require [honey.sql :as hsql]
            [instant.config :as config]
            [instant.data.resolvers :as resolvers]
            [instant.db.indexing-jobs :as jobs]
            [instant.db.model.attr :as attr-model]
            [instant.db.model.triple :as triple-model]
            [instant.db.transaction :as tx]
            [instant.fixtures :refer [with-empty-app
                                      with-zeneca-app
                                      with-zeneca-app-no-indexing
                                      with-indexing-job-queue]]
            [instant.jdbc.aurora :as aurora]
            [instant.jdbc.sql :as sql]
            [instant.util.json :refer [->json]]
            [instant.util.test :refer [wait-for]]
            [clojure.test :refer [deftest testing is]]))

(def wait-timeout (if (= :test (config/get-env))
                    5000
                    1000))

(defmacro check-estimate [job]
  `(let [finished-job# (jobs/get-by-id (:id ~job))]
     (is (pos? (:work_estimate finished-job#)))
     (is (= (:work_estimate finished-job#)
            (:work_completed finished-job#))
         "work estimate was not accurate")))

(deftest checks-types-works
  (with-indexing-job-queue job-queue
    (with-zeneca-app-no-indexing
      (fn [app r]
        (let [title-job (jobs/create-job!
                         {:app-id (:id app)
                          :attr-id (resolvers/->uuid r :books/title)
                          :job-type "check-data-type"
                          :checked-data-type "string"})

              order-job (jobs/create-job!
                         {:app-id (:id app)
                          :attr-id (resolvers/->uuid r :bookshelves/order)
                          :job-type "check-data-type"
                          :checked-data-type "number"})

              created-at-job (jobs/create-job!
                              {:app-id (:id app)
                               :attr-id (resolvers/->uuid r :users/createdAt)
                               :job-type "check-data-type"
                               :checked-data-type "date"})

              _ (jobs/enqueue-job job-queue title-job)
              _ (jobs/enqueue-job job-queue order-job)
              _ (jobs/enqueue-job job-queue created-at-job)
              _ (wait-for (fn []
                            (every? (fn [{:keys [id]}]
                                      (= "completed" (:job_status (jobs/get-by-id id))))
                                    [title-job
                                     order-job
                                     created-at-job]))
                          wait-timeout)
              title-triples (triple-model/fetch (aurora/conn-pool :read)
                                                (:id app)
                                                [[:= :attr-id (resolvers/->uuid r :books/title)]])
              order-triples (triple-model/fetch (aurora/conn-pool :read)
                                                (:id app)
                                                [[:= :attr-id (resolvers/->uuid r :bookshelves/order)]])

              created-at-triples (triple-model/fetch (aurora/conn-pool :read)
                                                     (:id app)
                                                     [[:= :attr-id (resolvers/->uuid r :users/createdAt)]])]

          (check-estimate title-job)
          (check-estimate order-job)
          (check-estimate created-at-job)
          (is (pos? (count title-triples)))
          (is (pos? (count order-triples)))
          (is (pos? (count created-at-triples)))
          (is (every? (fn [{:keys [triple checked-data-type]}]
                        (and (string? (nth triple 2))
                             (= checked-data-type "string")))
                      title-triples))
          (is (every? (fn [{:keys [triple checked-data-type]}]
                        (and (number? (nth triple 2))
                             (= checked-data-type "number")))
                      order-triples))

          (is (every? (fn [{:keys [checked-data-type]}]
                        (= checked-data-type "date"))
                      created-at-triples))

          (let [attrs (attr-model/get-by-app-id (:id app))]
            (is (= :string (-> (resolvers/->uuid r :books/title)
                               (attr-model/seek-by-id attrs)
                               :checked-data-type)))
            (is (= :number (-> (resolvers/->uuid r :bookshelves/order)
                               (attr-model/seek-by-id attrs)
                               :checked-data-type)))
            (is (= :date (-> (resolvers/->uuid r :users/createdAt)
                             (attr-model/seek-by-id attrs)
                             :checked-data-type)))
            (is (every? (fn [a]
                          (not (:checking-data-type? a)))
                        attrs))))))))

(deftest check-type-errors-with-invalid-triples
  (with-indexing-job-queue job-queue
    (with-zeneca-app-no-indexing
      (fn [app r]
        (let [handle-job (jobs/create-job!
                          {:app-id (:id app)
                           :attr-id (resolvers/->uuid r :users/handle)
                           :job-type "check-data-type"
                           :checked-data-type "number"})

              _ (jobs/enqueue-job job-queue handle-job)
              _ (wait-for (fn []
                            (every? (fn [{:keys [id]}]
                                      (= "errored" (:job_status (jobs/get-by-id id))))
                                    [handle-job]))
                          wait-timeout)
              handle-triples (triple-model/fetch (aurora/conn-pool :read)
                                                 (:id app)
                                                 [[:= :attr-id (resolvers/->uuid r :users/handle)]])]
          (is (pos? (count handle-triples)))
          (testing "didn't set invalid checked-data-type"
            (is (every? (fn [{:keys [checked-data-type]}]
                          (nil? checked-data-type))
                        handle-triples)))
          (is (= 4 (count (jobs/invalid-triples 100 (:id handle-job)))))

          (let [attrs (attr-model/get-by-app-id (:id app))]
            (is (nil? (-> (resolvers/->uuid r :users/handle)
                          (attr-model/seek-by-id attrs)
                          :checked-data-type)))
            (is (every? (fn [a]
                          (not (:checking-data-type? a)))
                        attrs))))))))

(deftest remove-types-works
  (with-indexing-job-queue job-queue
    (with-zeneca-app-no-indexing
      (fn [app r]
        (let [title-job (jobs/create-job!
                         {:app-id (:id app)
                          :attr-id (resolvers/->uuid r :books/title)
                          :job-type "check-data-type"
                          :checked-data-type "string"})

              _ (jobs/enqueue-job job-queue title-job)
              _ (wait-for (fn []
                            (every? (fn [{:keys [id]}]
                                      (= "completed" (:job_status (jobs/get-by-id id))))
                                    [title-job]))
                          wait-timeout)
              title-triples (triple-model/fetch (aurora/conn-pool :read)
                                                (:id app)
                                                [[:= :attr-id (resolvers/->uuid r :books/title)]])]
          (testing "setup worked"
            (is (pos? (count title-triples)))
            (is (every? (fn [{:keys [triple checked-data-type]}]
                          (and (string? (nth triple 2))
                               (= checked-data-type "string")))
                        title-triples))
            (let [attrs (attr-model/get-by-app-id (:id app))]
              (is (= :string (-> (resolvers/->uuid r :books/title)
                                 (attr-model/seek-by-id attrs)
                                 :checked-data-type)))))
          (let [remove-type-job (jobs/create-job!
                                 {:app-id (:id app)
                                  :attr-id (resolvers/->uuid r :books/title)
                                  :job-type "remove-data-type"})
                _ (jobs/enqueue-job job-queue remove-type-job)
                _ (wait-for (fn []
                              (every? (fn [{:keys [id]}]
                                        (= "completed" (:job_status (jobs/get-by-id id))))
                                      [remove-type-job]))
                            wait-timeout)
                title-triples (triple-model/fetch (aurora/conn-pool :read)
                                                  (:id app)
                                                  [[:= :attr-id (resolvers/->uuid r :books/title)]])]
            (check-estimate remove-type-job)
            (is (pos? (count title-triples)))
            (is (every? (fn [{:keys [checked-data-type]}]
                          (nil? checked-data-type))
                        title-triples))
            (let [attrs (attr-model/get-by-app-id (:id app))]
              (is (nil? (-> (resolvers/->uuid r :books/title)
                            (attr-model/seek-by-id attrs)
                            :checked-data-type))))))))))

(deftest index-works
  (with-indexing-job-queue job-queue
    (with-zeneca-app-no-indexing
      (fn [app r]
        (let [title-job (jobs/create-job!
                         {:app-id (:id app)
                          :attr-id (resolvers/->uuid r :books/title)
                          :job-type "index"})

              _ (jobs/enqueue-job job-queue title-job)
              _ (wait-for (fn []
                            (every? (fn [{:keys [id]}]
                                      (= "completed" (:job_status (jobs/get-by-id id))))
                                    [title-job]))
                          wait-timeout)
              title-triples (triple-model/fetch (aurora/conn-pool :read)
                                                (:id app)
                                                [[:= :attr-id (resolvers/->uuid r :books/title)]])]

          (testing "index"
            (check-estimate title-job)
            (is (pos? (count title-triples)))

            (is (every? (fn [{:keys [index]}]
                          (contains? index :ave))
                        title-triples))
            (let [attrs (attr-model/get-by-app-id (:id app))]
              (is (-> (resolvers/->uuid r :books/title)
                      (attr-model/seek-by-id attrs)
                      :index?))
              (is (not (-> (resolvers/->uuid r :books/title)
                           (attr-model/seek-by-id attrs)
                           :indexing)))))
          (testing "remove-index"
            (let [remove-index-job (jobs/create-job!
                                    {:app-id (:id app)
                                     :attr-id (resolvers/->uuid r :books/title)
                                     :job-type "remove-index"})
                  _ (jobs/enqueue-job job-queue remove-index-job)
                  _ (wait-for (fn []
                                (every? (fn [{:keys [id]}]
                                          (= "completed" (:job_status (jobs/get-by-id id))))
                                        [remove-index-job]))
                              wait-timeout)
                  title-triples (triple-model/fetch (aurora/conn-pool :read)
                                                    (:id app)
                                                    [[:= :attr-id (resolvers/->uuid r :books/title)]])]
              (check-estimate remove-index-job)
              (is (pos? (count title-triples)))
              (is (every? (fn [{:keys [index]}]
                            (not (contains? index :ave)))
                          title-triples))
              (let [attrs (attr-model/get-by-app-id (:id app))]
                (is (not (-> (resolvers/->uuid r :books/title)
                             (attr-model/seek-by-id attrs)
                             :index?)))
                (is (not (-> (resolvers/->uuid r :books/title)
                             (attr-model/seek-by-id attrs)
                             :indexing)))))))))))

(deftest index-inserts-null-values-for-blobs
  (with-indexing-job-queue job-queue
    (with-zeneca-app-no-indexing
      (fn [app r]
        (with-redefs [jobs/batch-size 100]
          (let [triples-to-delete-count 202

                title-triples-before (triple-model/fetch (aurora/conn-pool :read)
                                                         (:id app)
                                                         [[:= :attr-id (resolvers/->uuid r :books/title)]])
                _ (sql/execute! (aurora/conn-pool :write)
                                (hsql/format
                                 {:delete-from :triples
                                  :where [:and
                                          [:= :app-id (:id app)]
                                          (list* :or
                                                 (map (fn [{:keys [triple md5]}]
                                                        (let [[entity-id attr-id value] triple]
                                                          [:and
                                                           [:= :entity_id entity-id]
                                                           [:= :attr-id attr-id]
                                                           [:= :value [:cast (->json value) :jsonb]]
                                                           [:= :value-md5 md5]]))
                                                      (take triples-to-delete-count title-triples-before)))]}))
                title-job (jobs/create-job!
                           {:app-id (:id app)
                            :attr-id (resolvers/->uuid r :books/title)
                            :job-type "index"})

                _ (jobs/enqueue-job job-queue title-job)
                _ (wait-for (fn []
                              (every? (fn [{:keys [id]}]
                                        (= "completed" (:job_status (jobs/get-by-id id))))
                                      [title-job]))
                            wait-timeout)
                title-triples-after (triple-model/fetch (aurora/conn-pool :read)
                                                        (:id app)
                                                        [[:= :attr-id (resolvers/->uuid r :books/title)]])]

            (check-estimate title-job)

            (is (= (count title-triples-after)
                   (count title-triples-before)))

            (is (= triples-to-delete-count
                   (count (filter (fn [{:keys [triple]}]
                                    (nil? (nth triple 2)))
                                  title-triples-after))))

            (is (every? (fn [{:keys [index]}]
                          (contains? index :ave))
                        title-triples-after))
            (let [attrs (attr-model/get-by-app-id (:id app))]
              (is (-> (resolvers/->uuid r :books/title)
                      (attr-model/seek-by-id attrs)
                      :index?))
              (is (not (-> (resolvers/->uuid r :books/title)
                           (attr-model/seek-by-id attrs)
                           :indexing))))))))))

(deftest index-doesn't-insert-null-values-for-refs
  (with-indexing-job-queue job-queue
    (with-zeneca-app-no-indexing
      (fn [app r]
        (with-redefs [jobs/batch-size 10]
          (let [triples-to-delete-count 22

                triples-before (triple-model/fetch (aurora/conn-pool :read)
                                                   (:id app)
                                                   [[:= :attr-id (resolvers/->uuid r :users/bookshelves)]])
                _ (sql/execute! (aurora/conn-pool :write)
                                (hsql/format
                                 {:delete-from :triples
                                  :where [:and
                                          [:= :app-id (:id app)]
                                          (list* :or
                                                 (map (fn [{:keys [triple md5]}]
                                                        (let [[entity-id attr-id value] triple]
                                                          [:and
                                                           [:= :entity_id entity-id]
                                                           [:= :attr-id attr-id]
                                                           [:= :value [:cast (->json value) :jsonb]]
                                                           [:= :value-md5 md5]]))
                                                      (take triples-to-delete-count triples-before)))]}))
                job (jobs/create-job!
                     {:app-id (:id app)
                      :attr-id (resolvers/->uuid r :users/bookshelves)
                      :job-type "index"})

                _ (jobs/enqueue-job job-queue job)
                _ (wait-for (fn []
                              (every? (fn [{:keys [id]}]
                                        (= "completed" (:job_status (jobs/get-by-id id))))
                                      [job]))
                            wait-timeout)
                triples-after (triple-model/fetch (aurora/conn-pool :read)
                                                  (:id app)
                                                  [[:= :attr-id (resolvers/->uuid r :users/bookshelves)]])]

            (check-estimate job)

            (is (= (count triples-after)
                   (- (count triples-before) triples-to-delete-count)))

            (is (pos? (count triples-after)))

            (is (= 0
                   (count (filter (fn [{:keys [triple]}]
                                    (nil? (nth triple 2)))
                                  triples-after))))

            (is (every? (fn [{:keys [index]}]
                          (contains? index :ave))
                        triples-after))
            (let [attrs (attr-model/get-by-app-id (:id app))]
              (is (-> (resolvers/->uuid r :users/bookshelves)
                      (attr-model/seek-by-id attrs)
                      :index?))
              (is (not (-> (resolvers/->uuid r :users/bookshelves)
                           (attr-model/seek-by-id attrs)
                           :indexing))))))))))

(deftest unique-works
  (with-indexing-job-queue job-queue
    (with-empty-app
      (fn [app]
        (let [attr-id (random-uuid)

              _ (tx/transact! (aurora/conn-pool :write)
                              (attr-model/get-by-app-id (:id app))
                              (:id app)
                              [[:add-attr {:id attr-id
                                           :forward-identity [(random-uuid) "etype" "label"]
                                           :unique? false
                                           :index? false
                                           :value-type :blob
                                           :cardinality :one}]])
              _ (dotimes [x 10]
                  (tx/transact! (aurora/conn-pool :write)
                                (attr-model/get-by-app-id (:id app))
                                (:id app)
                                (for [i (range 1002)]
                                  [:add-triple (random-uuid) attr-id (format "%s-%s" x i)])))
              job (jobs/create-job!
                   {:app-id (:id app)
                    :attr-id attr-id
                    :job-type "unique"})

              _ (jobs/enqueue-job job-queue job)
              _ (wait-for (fn []
                            (every? (fn [{:keys [id]}]
                                      (= "completed" (:job_status (jobs/get-by-id id))))
                                    [job]))
                          wait-timeout)
              triples (triple-model/fetch (aurora/conn-pool :read)
                                          (:id app)
                                          [[:= :attr-id attr-id]])]
          (testing "unique"
            (check-estimate job)
            (is (pos? (count triples)))

            (is (every? (fn [{:keys [index]}]
                          (contains? index :av))
                        triples))
            (let [attrs (attr-model/get-by-app-id (:id app))]
              (is (-> (attr-model/seek-by-id attr-id attrs)
                      :unique?))
              (is (not (-> (attr-model/seek-by-id attr-id attrs)
                           :setting-unique?)))))
          (testing "remove-unique"
            (let [remove-unique-job (jobs/create-job!
                                     {:app-id (:id app)
                                      :attr-id attr-id
                                      :job-type "remove-unique"})
                  _ (jobs/enqueue-job job-queue remove-unique-job)
                  _ (wait-for (fn []
                                (every? (fn [{:keys [id]}]
                                          (= "completed" (:job_status (jobs/get-by-id id))))
                                        [remove-unique-job]))
                              wait-timeout)
                  triples (triple-model/fetch (aurora/conn-pool :read)
                                              (:id app)
                                              [[:= :attr-id attr-id]])]

              (check-estimate remove-unique-job)
              (is (pos? (count triples)))
              (is (every? (fn [{:keys [index]}]
                            (not (contains? index :av)))
                          triples))
              (let [attrs (attr-model/get-by-app-id (:id app))]
                (is (not (-> (attr-model/seek-by-id attr-id attrs)
                             :unique?)))
                (is (not (-> (attr-model/seek-by-id attr-id attrs)
                             :setting-unique?)))))))))))

(deftest rejects-not-unique-values
  (with-indexing-job-queue job-queue
    (with-empty-app
      (fn [app]
        (let [attr-id (random-uuid)

              _ (tx/transact! (aurora/conn-pool :write)
                              (attr-model/get-by-app-id (:id app))
                              (:id app)
                              [[:add-attr {:id attr-id
                                           :forward-identity [(random-uuid) "etype" "label"]
                                           :unique? false
                                           :index? false
                                           :value-type :blob
                                           :cardinality :one}]])
              _ (dotimes [x 5]
                  (tx/transact! (aurora/conn-pool :write)
                                (attr-model/get-by-app-id (:id app))
                                (:id app)
                                (for [i (range 1002)]
                                  [:add-triple (random-uuid) attr-id (format "%s-%s" x i)])))
              _ (tx/transact! (aurora/conn-pool :write)
                              (attr-model/get-by-app-id (:id app))
                              (:id app)
                              [[:add-triple (random-uuid) attr-id "a"]
                               [:add-triple (random-uuid) attr-id "a"]])
              job (jobs/create-job!
                   {:app-id (:id app)
                    :attr-id attr-id
                    :job-type "unique"})

              _ (jobs/enqueue-job job-queue job)
              _ (wait-for (fn []
                            (every? (fn [{:keys [id]}]
                                      (= "errored" (:job_status (jobs/get-by-id id))))
                                    [job]))
                          wait-timeout)
              triples (triple-model/fetch (aurora/conn-pool :read)
                                          (:id app)
                                          [[:= :attr-id attr-id]])
              job-for-client (jobs/get-by-id-for-client (:app_id job) (:id job))]
          (is (pos? (count triples)))

          (is (every? (fn [{:keys [index]}]
                        (not (contains? index :av)))
                      triples))
          (let [attrs (attr-model/get-by-app-id (:id app))]
            (is (not (-> (attr-model/seek-by-id attr-id attrs)
                         :unique?)))
            (is (not (-> (attr-model/seek-by-id attr-id attrs)
                         :setting-unique?))))

          ;; XXX: next up, check that we get an invalid triple
          (is (= "triple-not-unique-error" (:error job-for-client)))

          (is (= ["a" "a"]
                 (map #(get % "value") (-> job-for-client
                                           :invalid_triples_sample)))))))))

(deftest rejects-too-large-values
  (with-indexing-job-queue job-queue
    (with-empty-app
      (fn [app]
        (let [id-attr-id (random-uuid)
              attr-id (random-uuid)

              _ (tx/transact! (aurora/conn-pool :write)
                              (attr-model/get-by-app-id (:id app))
                              (:id app)
                              [[:add-attr {:id id-attr-id
                                           :forward-identity [(random-uuid) "etype" "id"]
                                           :unique? true
                                           :index? false
                                           :value-type :blob
                                           :cardinality :one}]
                               [:add-attr {:id attr-id
                                           :forward-identity [(random-uuid) "etype" "label"]
                                           :unique? false
                                           :index? false
                                           :value-type :blob
                                           :cardinality :one}]])
              _ (dotimes [x 5]
                  (tx/transact! (aurora/conn-pool :write)
                                (attr-model/get-by-app-id (:id app))
                                (:id app)
                                (for [i (range 1002)]
                                  [:add-triple (random-uuid) attr-id (format "%s-%s" x i)])))
              bad-id (random-uuid)
              _ (tx/transact! (aurora/conn-pool :write)
                              (attr-model/get-by-app-id (:id app))
                              (:id app)
                              [[:add-triple bad-id attr-id (apply str (repeatedly 1024 random-uuid))]])
              unique-job (jobs/create-job!
                          {:app-id (:id app)
                           :attr-id attr-id
                           :job-type "unique"})
              index-job (jobs/create-job!
                         {:app-id (:id app)
                          :attr-id attr-id
                          :job-type "index"})

              _ (jobs/enqueue-job job-queue unique-job)
              _ (jobs/enqueue-job job-queue index-job)
              _ (wait-for (fn []
                            (every? (fn [{:keys [id]}]
                                      (not (contains? #{"processing" "waiting"} (:job_status (jobs/get-by-id id)))))
                                    [unique-job
                                     index-job]))
                          wait-timeout)
              triples (triple-model/fetch (aurora/conn-pool :read)
                                          (:id app)
                                          [[:= :attr-id attr-id]])
              unique-job-for-client (jobs/get-by-id-for-client (:id app) (:id unique-job))
              index-job-for-client (jobs/get-by-id-for-client (:id app) (:id index-job))]
          (is (pos? (count triples)))

          (is (every? (fn [{:keys [index]}]
                        (and (not (contains? index :ave))
                             (not (contains? index :av))))
                      triples))
          (let [attrs (attr-model/get-by-app-id (:id app))]
            (is (not (-> (attr-model/seek-by-id attr-id attrs)
                         :unique?)))
            (is (not (-> (attr-model/seek-by-id attr-id attrs)
                         :setting-unique?)))
            (is (not (-> (attr-model/seek-by-id attr-id attrs)
                         :index?)))
            (is (not (-> (attr-model/seek-by-id attr-id attrs)
                         :indexing?))))

          (is (= "triple-too-large-error" (:error unique-job-for-client)))
          (is (= "triple-too-large-error" (:error index-job-for-client)))

          (is (= [(str bad-id)]
                 (map #(get % "entity_id") (-> unique-job-for-client
                                               :invalid_triples_sample)))))))))

(deftest required-works-with-no-errors
  (with-indexing-job-queue job-queue
    (with-zeneca-app
      (fn [app r]
        (let [title-job (jobs/create-job!
                         {:app-id (:id app)
                          :attr-id (resolvers/->uuid r :books/title)
                          :job-type "required"})

              _ (jobs/enqueue-job job-queue title-job)
              _ (wait-for (fn []
                            (every? (fn [{:keys [id]}]
                                      (= "completed" (:job_status (jobs/get-by-id id))))
                                    [title-job]))
                          wait-timeout)
              attrs (attr-model/get-by-app-id (:id app))]

          (is (-> (resolvers/->uuid r :books/title)
                  (attr-model/seek-by-id attrs)
                  :required?)))
        (testing "remove-required-works"
          (let [title-job (jobs/create-job!
                           {:app-id (:id app)
                            :attr-id (resolvers/->uuid r :books/title)
                            :job-type "remove-required"})

                _ (jobs/enqueue-job job-queue title-job)
                _ (wait-for (fn []
                              (every? (fn [{:keys [id]}]
                                        (= "completed" (:job_status (jobs/get-by-id id))))
                                      [title-job]))
                            wait-timeout)
                attrs (attr-model/get-by-app-id (:id app))]

            (is (not (-> (resolvers/->uuid r :books/title)
                         (attr-model/seek-by-id attrs)
                         :required?)))))))))


(deftest required-works-with-errors
  (with-indexing-job-queue job-queue
    (with-zeneca-app
      (fn [app r]
        (let [triples-to-delete-count 202

              title-triples-before (triple-model/fetch (aurora/conn-pool :read)
                                                       (:id app)
                                                       [[:= :attr-id (resolvers/->uuid r :books/title)]])
              _ (sql/execute! (aurora/conn-pool :write)
                              (hsql/format
                               {:delete-from :triples
                                :where [:and
                                        [:= :app-id (:id app)]
                                        (list* :or
                                               (map (fn [{:keys [triple md5]}]
                                                      (let [[entity-id attr-id value] triple]
                                                        [:and
                                                         [:= :entity_id entity-id]
                                                         [:= :attr-id attr-id]
                                                         [:= :value [:cast (->json value) :jsonb]]
                                                         [:= :value-md5 md5]]))
                                                    (take triples-to-delete-count title-triples-before)))]}))
              title-job (jobs/create-job!
                         {:app-id (:id app)
                          :attr-id (resolvers/->uuid r :books/title)
                          :job-type "required"})

              _ (jobs/enqueue-job job-queue title-job)
              _ (wait-for (fn []
                            (every? (fn [{:keys [id]}]
                                      (= "errored" (:job_status (jobs/get-by-id id))))
                                    [title-job]))
                          wait-timeout)
              job-after (jobs/get-by-id (:id title-job))]

          (is (= (:error job-after)
                 "missing-required-error"))

          (is (= 202 (get-in job-after [:error_data "count"])))

          (is (= "books" (get-in job-after [:error_data "etype"])))

          (is (= "title" (get-in job-after [:error_data "label"])))

          (is (seq (get-in job-after [:error_data "entity-ids"])))

          (let [attrs (attr-model/get-by-app-id (:id app))]
            (is (not (-> (resolvers/->uuid r :books/title)
                         (attr-model/seek-by-id attrs)
                         :required?)))))))))

(deftest required-works-with-null
  (with-indexing-job-queue job-queue
    (with-zeneca-app
      (fn [app r]
        (let [triples-to-delete-count 202

              title-triples-before (triple-model/fetch (aurora/conn-pool :read)
                                                       (:id app)
                                                       [[:= :attr-id (resolvers/->uuid r :books/title)]])
              _ (sql/execute! (aurora/conn-pool :write)
                              (hsql/format
                               {:update :triples
                                :set {:value [:cast "null" :jsonb]}
                                :where [:and
                                        [:= :app-id (:id app)]
                                        (list* :or
                                               (map (fn [{:keys [triple md5]}]
                                                      (let [[entity-id attr-id value] triple]
                                                        [:and
                                                         [:= :entity_id entity-id]
                                                         [:= :attr-id attr-id]
                                                         [:= :value [:cast (->json value) :jsonb]]
                                                         [:= :value-md5 md5]]))
                                                    (take triples-to-delete-count title-triples-before)))]}))
              title-job (jobs/create-job!
                         {:app-id (:id app)
                          :attr-id (resolvers/->uuid r :books/title)
                          :job-type "required"})

              _ (jobs/enqueue-job job-queue title-job)
              _ (wait-for (fn []
                            (every? (fn [{:keys [id]}]
                                      (= "errored" (:job_status (jobs/get-by-id id))))
                                    [title-job]))
                          wait-timeout)
              job-after (jobs/get-by-id (:id title-job))]

          (is (= (:error job-after)
                 "missing-required-error"))

          (is (= 202 (get-in job-after [:error_data "count"])))

          (is (= "books" (get-in job-after [:error_data "etype"])))

          (is (= "title" (get-in job-after [:error_data "label"])))

          (is (seq (get-in job-after [:error_data "entity-ids"])))

          (let [attrs (attr-model/get-by-app-id (:id app))]
            (is (not (-> (resolvers/->uuid r :books/title)
                         (attr-model/seek-by-id attrs)
                         :required?)))))))))
