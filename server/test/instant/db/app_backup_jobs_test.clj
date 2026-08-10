(ns instant.db.app-backup-jobs-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [instant.backup :as backup]
   [instant.data.constants :refer [test-user-id]]
   [instant.db.app-backup-jobs :as app-backup-jobs]
   [instant.model.app :as app-model]
   [instant.util.async :as ua]
   [instant.util.test :refer [instant-ex-data wait-for]]))

(def ^:private wait-timeout 10000)

(defn- create-app! []
  (let [id (random-uuid)]
    (app-model/create! {:title "backup-jobs-test-app"
                        :creator-id test-user-id
                        :id id
                        :admin-token (random-uuid)})))

(defn- with-apps
  "Creates `n` throwaway apps, passes the vector to `f`, and deletes them after
   (which cascades away their backup-job rows)."
  [n f]
  (let [apps (vec (repeatedly n create-app!))]
    (try
      (f apps)
      (finally
        (doseq [{:keys [id]} apps]
          (app-model/delete-immediately-by-id! {:id id}))))))

(defn- job-status [job]
  (:job_status (app-backup-jobs/get-by-id (:id job))))

(deftest runs-at-most-n-backups-at-a-time
  (let [n 2
        ;; More jobs than the pool's queue can hold (`make-pool` bounds the queue
        ;; at `max-worker-count`), so the extra `.execute` calls hit the
        ;; DiscardPolicy path. Self-continuation still has to drain every job.
        total (+ app-backup-jobs/max-worker-count 8)
        ;; A fresh pool sized `n` so we get a clean concurrency cap that doesn't
        ;; depend on the flag value the shared pool happened to start with.
        pool (app-backup-jobs/make-pool n)
        running (atom 0)
        max-running (atom 0)
        ;; The workers block here until we let them finish, so we can observe
        ;; exactly how many run at once.
        release (promise)]
    (with-redefs [app-backup-jobs/pool pool
                  ;; Don't actually run the backup--just record concurrency and
                  ;; block until the test releases us.
                  backup/backup-app-on-primary!
                  (fn [_params]
                    (let [cur (swap! running inc)]
                      (swap! max-running max cur)
                      (try
                        @release
                        (finally
                          (swap! running dec)))
                      ;; `app-backup` is nil so `run-job!` writes a null
                      ;; `app_backup_id`; a fake uuid would trip the FK to
                      ;; `app_backups` and error the job instead of completing it.
                      {:triple-count 0
                       :app-backup nil}))]
      (with-apps total
        (fn [apps]
          (try
            (let [jobs (mapv (fn [app]
                               (app-backup-jobs/enqueue! {:app-id (:id app)
                                                          :description "test backup"}))
                             apps)]
              ;; Wait until the pool has spun up all the workers it's allowed to.
              (wait-for #(= n @running) wait-timeout)

              (testing "only n workers run concurrently"
                (is (= n @running))
                (is (= n @max-running)))

              (testing "the db reflects n processing and the rest still waiting"
                (let [freq (frequencies (map job-status jobs))]
                  (is (= n (get freq "processing" 0)))
                  (is (= (- total n) (get freq "waiting" 0)))))

              ;; Let the blocked workers finish; the pool should drain the rest.
              (deliver release true)

              (testing "every job completes once the workers are unblocked"
                (wait-for (fn []
                            (every? #(= "completed" (job-status %)) jobs))
                          wait-timeout)
                (is (every? #(= "completed" (job-status %)) jobs)))

              (testing "we never exceeded n concurrent backups"
                (is (= n @max-running))))
            (finally
              ;; Make sure nothing stays blocked if an assertion threw, and wait
              ;; for the pool to fully terminate so no straggler worker drains the
              ;; shared table in the next test.
              (deliver release true)
              (app-backup-jobs/shutdown-pool pool wait-timeout))))))))

(deftest rejects-a-second-in-flight-backup-for-the-same-app
  (let [pool (app-backup-jobs/make-pool 1)
        release (promise)]
    (with-redefs [app-backup-jobs/pool pool
                  backup/backup-app-on-primary!
                  (fn [_params]
                    @release
                    {:triple-count 0
                     :app-backup nil})]
      (with-apps 1
        (fn [[app]]
          (try
            (app-backup-jobs/enqueue! {:app-id (:id app)})
            (let [err (instant-ex-data
                       (app-backup-jobs/enqueue! {:app-id (:id app)}))]
              (is (= :instant.util.exception/validation-failed
                     (:instant.util.exception/type err)))
              (is (re-find #"already in progress"
                           (:instant.util.exception/message err))))
            (finally
              ;; Wait for the pool to fully terminate so this test's worker can't
              ;; still be draining the shared table when the next test starts.
              (deliver release true)
              (app-backup-jobs/shutdown-pool pool wait-timeout))))))))

(deftest killing-the-pool-cancels-in-flight-work
  ;; Just the pool mechanics--no db, no real backup. We run a task shaped like
  ;; `run-job!` (a vfuture waited on in a deref loop, with a catch standing in
  ;; for `mark-error!`) and confirm that killing the pool cancels the registered
  ;; vfuture and that the cancellation propagates out of the deref loop so the
  ;; catch runs.
  (let [pool (app-backup-jobs/make-pool 1)
        started (promise)
        unwound (promise)
        errored (promise)
        caught (atom nil)
        ;; The "backup" blocks here until it's interrupted.
        block (promise)
        task (fn []
               (let [fut (ua/vfuture
                          (try
                            (deliver started true)
                            @block
                            (finally
                              (deliver unwound true))))]
                 (try
                   ;; Stand-in for run-job!'s progress loop: wait on the backup.
                   (loop []
                     (when (identical? ::pending (deref fut 100 ::pending))
                       (recur)))
                   (catch Throwable t
                     ;; Stand-in for mark-error!: the error propagated to us.
                     (future-cancel fut)
                     (deref unwound app-backup-jobs/cancel-unwind-timeout-ms ::timeout)
                     (reset! caught t)
                     (deliver errored true)))))]
    (try
      ;; Runs on a pool worker, so the vfuture registers with the pool's
      ;; in-flight map via the worker's `*child-vfutures*` binding.
      (.execute pool ^Runnable task)
      (is (= true (deref started 5000 nil))
          "the task's backup vfuture started (and registered with the pool)")
      (is (not (realized? errored))
          "nothing errored while the backup was still blocked")

      ;; Kill the pool with a tiny grace so we don't wait out the real window.
      (app-backup-jobs/shutdown-pool pool 100)

      (is (= true (deref errored 5000 nil))
          "the deref loop threw, so the mark-error! stand-in ran")
      (is (instance? java.util.concurrent.CancellationException @caught)
          "the propagated error was the vfuture's cancellation")
      (is (realized? unwound)
          "the backup vfuture unwound its resources")
      (finally
        (deliver block true)
        (app-backup-jobs/shutdown-pool pool wait-timeout)))))
