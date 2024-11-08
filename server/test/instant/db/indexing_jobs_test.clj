(ns instant.db.indexing-jobs-test
  (:require [instant.data.resolvers :as resolvers]
            [instant.db.indexing-jobs :as jobs]
            [instant.db.model.attr :as attr-model]
            [instant.db.model.triple :as triple-model]
            [instant.fixtures :refer [with-zeneca-app]]
            [instant.jdbc.aurora :as aurora]
            [instant.util.test :refer [wait-for]]
            [clojure.core.async :as a]
            [clojure.test :refer [deftest testing is]]))

(deftest indexing-jobs-checks-types
  (with-zeneca-app
    (fn [app r]
      (let [job-queue (a/chan)
            process (future (jobs/start-process job-queue))
            title-job (jobs/create-check-data-type-job!
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

            _ (jobs/enqueue-job title-job)
            _ (jobs/enqueue-job order-job)
            _ (jobs/enqueue-job created-at-job)
            _ (wait-for (fn []
                          (every? (fn [{:keys [id]}]
                                    (= "completed" (:job_status (jobs/get-by-id id))))
                                  [title-job
                                   order-job]))
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
                      attrs)))))))

(deftest indexing-jobs-errors-with-invalid-triples
  (with-zeneca-app
    (fn [app r]
      (let [job-queue (a/chan)
            process (future (jobs/start-process job-queue))
            handle-job (jobs/create-check-data-type-job!
                        {:app-id (:id app)
                         :attr-id (resolvers/->uuid r :users/handle)
                         :checked-data-type "number"})

            _ (jobs/enqueue-job handle-job)
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
                      attrs)))))))
