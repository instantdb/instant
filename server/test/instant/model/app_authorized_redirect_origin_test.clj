(ns instant.model.app-authorized-redirect-origin-test
  (:require
   [clojure.test :as test :refer [are deftest testing]]
   [instant.model.app-authorized-redirect-origin :as sut]))

(deftest find-match
  (testing "find-match"
    (let [generic {:id (random-uuid) :service "generic" :params ["example.com"]}
          netlify {:id (random-uuid) :service "netlify" :params ["mysitename"]}
          vercel {:id (random-uuid) :service "vercel" :params ["vercel.app" "some-project-name"]}]
      (are [url result] (= result (sut/find-match [generic netlify vercel] url))
        "https://example.com/oauth/callback" generic
        "https://random-url.com/oauth/callback" nil
        "https://mysitename.netlify.app" netlify
        "https://deploy-preview-42--mysitename.netlify.app" netlify
        "https://some-project-name.vercel.app" vercel
        "https://some-project-name-git-some-branch-name.vercel.app" vercel))))
