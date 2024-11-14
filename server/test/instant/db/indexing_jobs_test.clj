(ns instant.db.indexing-jobs-test
  (:require [instant.data.resolvers :as resolvers]
            [instant.db.indexing-jobs :as jobs]
            [instant.db.model.attr :as attr-model]
            [instant.db.model.triple :as triple-model]
            [instant.db.transaction :as tx]
            [instant.fixtures :refer [with-empty-app with-zeneca-app]]
            [instant.jdbc.aurora :as aurora]
            [instant.util.test :refer [wait-for]]
            [clojure.core.async :as a]
            [clojure.test :refer [deftest testing is]]))

(defmacro with-queue [job-queue & body]
  `(let [chan# (a/chan 1024)
         process# (future (jobs/start-process chan#))
         ~job-queue chan#]
     (try
       ~@body
       (finally
         (a/close! chan#)
         (when (= :timeout (deref process# 1000 :timeout))
           (throw (Exception. "Timeout in with-queue")))))))

(deftest checks-types-works
  (with-queue job-queue
    (with-zeneca-app
      (fn [app r]
        (let [title-job (jobs/create-check-data-type-job!
                         {:app-id (:id app)
                          :attr-id (resolvers/->uuid r :books/title)
                          :checked-data-type "string"})

              order-job (jobs/create-check-data-type-job!
                         {:app-id (:id app)
                          :attr-id (resolvers/->uuid r :bookshelves/order)
                          :checked-data-type "number"})

              created-at-job (jobs/create-check-data-type-job!
                              {:app-id (:id app)
                               :attr-id (resolvers/->uuid r :users/createdAt)
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
                          1000)
              title-triples (triple-model/fetch aurora/conn-pool
                                                (:id app)
                                                [[:= :attr-id (resolvers/->uuid r :books/title)]])
              order-triples (triple-model/fetch aurora/conn-pool
                                                (:id app)
                                                [[:= :attr-id (resolvers/->uuid r :bookshelves/order)]])

              created-at-triples (triple-model/fetch aurora/conn-pool
                                                     (:id app)
                                                     [[:= :attr-id (resolvers/->uuid r :users/createdAt)]])]
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

          (is (every? (fn [{:keys [triple checked-data-type]}]
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
  (with-queue job-queue
    (with-zeneca-app
      (fn [app r]
        (let [handle-job (jobs/create-check-data-type-job!
                          {:app-id (:id app)
                           :attr-id (resolvers/->uuid r :users/handle)
                           :checked-data-type "number"})

              _ (jobs/enqueue-job job-queue handle-job)
              _ (wait-for (fn []
                            (every? (fn [{:keys [id]}]
                                      (= "errored" (:job_status (jobs/get-by-id id))))
                                    [handle-job]))
                          1000)
              handle-triples (triple-model/fetch aurora/conn-pool
                                                 (:id app)
                                                 [[:= :attr-id (resolvers/->uuid r :users/handle)]])]
          (is (pos? (count handle-triples)))
          (testing "didn't set invalid checked-data-type"
            (is (every? (fn [{:keys [checked-data-type]}]
                          (nil? checked-data-type))
                        handle-triples)))
          (= 5 (count (jobs/invalid-triples 100 (:id handle-job))))

          (let [attrs (attr-model/get-by-app-id (:id app))]
            (is (nil? (-> (resolvers/->uuid r :users/handle)
                          (attr-model/seek-by-id attrs)
                          :checked-data-type)))
            (is (every? (fn [a]
                          (not (:checking-data-type? a)))
                        attrs))))))))

(deftest remove-types-works
  (with-queue job-queue
    (with-zeneca-app
      (fn [app r]
        (let [title-job (jobs/create-check-data-type-job!
                         {:app-id (:id app)
                          :attr-id (resolvers/->uuid r :books/title)
                          :checked-data-type "string"})

              _ (jobs/enqueue-job job-queue title-job)
              _ (wait-for (fn []
                            (every? (fn [{:keys [id]}]
                                      (= "completed" (:job_status (jobs/get-by-id id))))
                                    [title-job]))
                          1000)
              title-triples (triple-model/fetch aurora/conn-pool
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
          (let [remove-type-job (jobs/create-remove-data-type-job!
                                 {:app-id (:id app)
                                  :attr-id (resolvers/->uuid r :books/title)})
                _ (jobs/enqueue-job job-queue remove-type-job)
                _ (wait-for (fn []
                              (every? (fn [{:keys [id]}]
                                        (= "completed" (:job_status (jobs/get-by-id id))))
                                      [remove-type-job]))
                            1000)
                title-triples (triple-model/fetch aurora/conn-pool
                                                  (:id app)
                                                  [[:= :attr-id (resolvers/->uuid r :books/title)]])]
            (is (pos? (count title-triples)))
            (is (every? (fn [{:keys [checked-data-type]}]
                          (nil? checked-data-type))
                        title-triples))
            (let [attrs (attr-model/get-by-app-id (:id app))]
              (is (nil? (-> (resolvers/->uuid r :books/title)
                            (attr-model/seek-by-id attrs)
                            :checked-data-type))))))))))

(deftest index-works
  (with-queue job-queue
    (with-zeneca-app
      (fn [app r]
        (let [title-job (jobs/create-index-job!
                         {:app-id (:id app)
                          :attr-id (resolvers/->uuid r :books/title)})

              _ (jobs/enqueue-job job-queue title-job)
              _ (wait-for (fn []
                            (every? (fn [{:keys [id]}]
                                      (= "completed" (:job_status (jobs/get-by-id id))))
                                    [title-job]))
                          1000)
              title-triples (triple-model/fetch aurora/conn-pool
                                                (:id app)
                                                [[:= :attr-id (resolvers/->uuid r :books/title)]])]
          (testing "index"
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
            (let [remove-index-job (jobs/create-remove-index-job!
                                    {:app-id (:id app)
                                     :attr-id (resolvers/->uuid r :books/title)})
                  _ (jobs/enqueue-job job-queue remove-index-job)
                  _ (wait-for (fn []
                                (every? (fn [{:keys [id]}]
                                          (= "completed" (:job_status (jobs/get-by-id id))))
                                        [remove-index-job]))
                              1000)
                  title-triples (triple-model/fetch aurora/conn-pool
                                                    (:id app)
                                                    [[:= :attr-id (resolvers/->uuid r :books/title)]])]
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

(deftest unique-works
  (with-queue job-queue
    (with-empty-app
      (fn [app]
        (let [attr-id (random-uuid)

              _ (tx/transact! aurora/conn-pool
                              (attr-model/get-by-app-id (:id app))
                              (:id app)
                              [[:add-attr {:id attr-id
                                           :forward-identity [(random-uuid) "etype" "label"]
                                           :unique? false
                                           :index? false
                                           :value-type :blob
                                           :cardinality :one}]])
              _ (dotimes [x 20]
                  (tx/transact! aurora/conn-pool
                                (attr-model/get-by-app-id (:id app))
                                (:id app)
                                (for [i (range 1002)]
                                  [:add-triple (random-uuid) attr-id (format "%s-%s" x i)])))
              job (jobs/create-unique-job!
                   {:app-id (:id app)
                    :attr-id attr-id})

              _ (jobs/enqueue-job job-queue job)
              _ (wait-for (fn []
                            (every? (fn [{:keys [id]}]
                                      (= "completed" (:job_status (jobs/get-by-id id))))
                                    [job]))
                          1000)
              triples (triple-model/fetch aurora/conn-pool
                                          (:id app)
                                          [[:= :attr-id attr-id]])]
          (testing "unique"
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
            (let [remove-unique-job (jobs/create-remove-unique-job!
                                     {:app-id (:id app)
                                      :attr-id attr-id})
                  _ (jobs/enqueue-job job-queue remove-unique-job)
                  _ (wait-for (fn []
                                (every? (fn [{:keys [id]}]
                                          (= "completed" (:job_status (jobs/get-by-id id))))
                                        [remove-unique-job]))
                              1000)
                  triples (triple-model/fetch aurora/conn-pool
                                              (:id app)
                                              [[:= :attr-id attr-id]])]
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
  (with-queue job-queue
    (with-empty-app
      (fn [app]
        (let [attr-id (random-uuid)

              _ (tx/transact! aurora/conn-pool
                              (attr-model/get-by-app-id (:id app))
                              (:id app)
                              [[:add-attr {:id attr-id
                                           :forward-identity [(random-uuid) "etype" "label"]
                                           :unique? false
                                           :index? false
                                           :value-type :blob
                                           :cardinality :one}]])
              _ (dotimes [x 5]
                  (tx/transact! aurora/conn-pool
                                (attr-model/get-by-app-id (:id app))
                                (:id app)
                                (for [i (range 1002)]
                                  [:add-triple (random-uuid) attr-id (format "%s-%s" x i)])))
              _ (tx/transact! aurora/conn-pool
                              (attr-model/get-by-app-id (:id app))
                              (:id app)
                              [[:add-triple (random-uuid) attr-id "a"]
                               [:add-triple (random-uuid) attr-id "a"]])
              job (jobs/create-unique-job!
                   {:app-id (:id app)
                    :attr-id attr-id})

              _ (jobs/enqueue-job job-queue job)
              _ (wait-for (fn []
                            (every? (fn [{:keys [id]}]
                                      (= "errored" (:job_status (jobs/get-by-id id))))
                                    [job]))
                          1000)
              triples (triple-model/fetch aurora/conn-pool
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
  (with-queue job-queue
    (with-empty-app
      (fn [app]
        (let [attr-id (random-uuid)

              _ (tx/transact! aurora/conn-pool
                              (attr-model/get-by-app-id (:id app))
                              (:id app)
                              [[:add-attr {:id attr-id
                                           :forward-identity [(random-uuid) "etype" "label"]
                                           :unique? false
                                           :index? false
                                           :value-type :blob
                                           :cardinality :one}]])
              _ (dotimes [x 5]
                  (tx/transact! aurora/conn-pool
                                (attr-model/get-by-app-id (:id app))
                                (:id app)
                                (for [i (range 1002)]
                                  [:add-triple (random-uuid) attr-id (format "%s-%s" x i)])))
              bad-id (random-uuid)
              _ (tx/transact! aurora/conn-pool
                              (attr-model/get-by-app-id (:id app))
                              (:id app)
                              [[:add-triple bad-id attr-id (apply str (repeatedly 1024 random-uuid))]])
              unique-job (jobs/create-unique-job!
                          {:app-id (:id app)
                           :attr-id attr-id})
              index-job (jobs/create-index-job!
                         {:app-id (:id app)
                          :attr-id attr-id})

              _ (jobs/enqueue-job job-queue unique-job)
              _ (jobs/enqueue-job job-queue index-job)
              _ (wait-for (fn []
                            (every? (fn [{:keys [id]}]
                                      (not (contains? #{"processing" "waiting"} (:job_status (jobs/get-by-id id)))))
                                    [unique-job
                                     index-job]))
                          1000)
              triples (triple-model/fetch aurora/conn-pool
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
