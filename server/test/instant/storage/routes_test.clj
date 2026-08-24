(ns instant.storage.routes-test
  (:require [clojure.test :as test :refer [deftest is testing]]
            [instant.storage.routes :as storage-routes]
            [instant.storage.coordinator :as storage-coordinator]))

(deftest upload-put-reads-path-from-query-params
  ;; Filenames with accents (e.g. macOS's NFD-decomposed "café.txt") can't
  ;; be sent as raw HTTP header values, so clients send them as an encoded
  ;; query param (already URL-decoded by Ring's wrap-params) instead. The
  ;; route should prefer that over the legacy `path` header.
  (let [captured-ctx (atom nil)
        app-id (random-uuid)]
    (with-redefs [storage-coordinator/upload-file!
                  (fn [ctx _file]
                    (reset! captured-ctx ctx)
                    {:id "fake-file-id"})]
      (testing "path comes from query params when present"
        (let [ret (storage-routes/upload-put
                   {:body "file-contents"
                    :params {:app_id (str app-id)
                             :path "café à noite.txt"}
                    :headers {"app-id" (str app-id)
                              "content-type" "text/plain"}
                    :content-length 5})]
          (is (= 200 (:status ret)))
          (is (= "café à noite.txt" (:path @captured-ctx)))))

      (testing "path still works from the legacy header for ASCII filenames"
        (let [ret (storage-routes/upload-put
                   {:body "file-contents"
                    :params {}
                    :headers {"app-id" (str app-id)
                              "path" "legacy-file.txt"
                              "content-type" "text/plain"}
                    :content-length 5})]
          (is (= 200 (:status ret)))
          (is (= "legacy-file.txt" (:path @captured-ctx)))))

      (testing "query param takes priority over the header when both are present"
        (let [ret (storage-routes/upload-put
                   {:body "file-contents"
                    :params {:path "café.txt"}
                    :headers {"app-id" (str app-id)
                              "path" "stale-ascii-name.txt"
                              "content-type" "text/plain"}
                    :content-length 5})]
          (is (= 200 (:status ret)))
          (is (= "café.txt" (:path @captured-ctx))))))))
