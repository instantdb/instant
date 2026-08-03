(ns instant.dash.ephemeral-app-test
  (:require
   [clojure.test :refer [deftest is]]
   [instant.dash.ephemeral-app :as ephemeral-app]
   [instant.flags :as flags]
   [instant.util.exception :as ex]))

(deftest create-is-denied-when-ephemeral-apps-are-disabled
  (with-redefs [flags/ephemeral-apps-enabled? (constantly false)]
    (try
      (ephemeral-app/http-post-handler {:body {:title "test-app"}})
      (is false "Expected temporary app creation to be denied")
      (catch clojure.lang.ExceptionInfo e
        (is (= ::ex/permission-denied
               (::ex/type (ex-data e))))))))
