(ns instant.storage.routes-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [instant.model.app-user :as app-user-model]
   [instant.storage.routes :as routes]))

(deftest req->app-file-app-id-header-test
  (let [app-id (random-uuid)
        params {:path "photos/demo.png"}]
    (with-redefs [app-user-model/get-by-refresh-token (constantly nil)]
      (testing "accepts the app-id header"
        (let [ctx (routes/req->app-file! {}
                                         (assoc params :app-id (str app-id)))]
          (is (= app-id (:app-id ctx)))))

      (testing "accepts the legacy app_id header"
        (let [ctx (routes/req->app-file! {}
                                         (assoc params :app_id (str app-id)))]
          (is (= app-id (:app-id ctx)))))

      (testing "prefers the app-id header"
        (let [ctx (routes/req->app-file! {}
                                         (assoc params
                                                :app-id (str app-id)
                                                :app_id (str (random-uuid))))]
          (is (= app-id (:app-id ctx))))))))
