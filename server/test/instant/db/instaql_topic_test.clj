(ns instant.db.instaql-topic-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [instant.db.instaql :as iq]
   [instant.db.model.attr :as attr-model]
   [instant.fixtures :refer [with-zeneca-app]]
   [instant.db.instaql-topic :as iqt]
   [instant.data.resolvers :as resolvers]))

;; ----
;; Tests

(deftest not-supported
  (with-zeneca-app
    (fn [app _r]
      (let [attrs (attr-model/get-by-app-id (:id app))]
        (is (= {:not-supported [:child-forms]}
               (iqt/instaql-topic
                {:attrs attrs}
                (iq/->forms! attrs {:users {:bookshelves {}}}))))

        (is (= {:not-supported [:multi-part-path]}
               (iqt/instaql-topic
                {:attrs attrs}
                (iq/->forms! attrs {:users {:$ {:where {:bookshelves.title "2024"}}}}))))

        (is (= {:not-supported [:complex-value-type]}
               (iqt/instaql-topic
                {:attrs attrs}
                (iq/->forms! attrs {:users {:$ {:where {:handle {:$ilike "%moop%"}}}}}))))))))

(deftest composites
  (with-zeneca-app
    (fn [app r]
      (let [attrs (attr-model/get-by-app-id (:id app))
            {:keys [edn cel-str program]} (iqt/instaql-topic
                                           {:attrs attrs}
                                           (iq/->forms! attrs {:users {:$ {:where {:handle "stopa"
                                                                                   :email "stopa@instantdb.com"}}}}))]
        (is (= '(and
                 (= (:etype entity) "users")
                 (= (get (:attrs entity) :users/handle) "stopa")
                 (= (get (:attrs entity) :users/email) "stopa@instantdb.com"))
               (resolvers/walk-friendly r edn)))

        (is (= (str "(entity[\"etype\"] == \"users\" && "
                    "entity[\"attrs\"][\"" (resolvers/->uuid r :users/handle) "\"] == \"stopa\" && "
                    "entity[\"attrs\"][\"" (resolvers/->uuid r :users/email) "\"] == \"stopa@instantdb.com\")")
               cel-str))

        (is (true?
             (program {:etype "users"
                       :attrs {(str (resolvers/->uuid r :users/handle))
                               "stopa"
                               (str (resolvers/->uuid r :users/email))
                               "stopa@instantdb.com"}})))

        (is (false?
             (program {:etype "posts"
                       :attrs {(str (resolvers/->uuid r :users/handle))
                               "stopa"
                               (str (resolvers/->uuid r :users/email))
                               "stopa@instantdb.com"}})))
        (is (false?
             (program {:etype "users"
                       :attrs {(str (resolvers/->uuid r :users/handle))
                               "aio"
                               (str (resolvers/->uuid r :users/email))
                               "stopa@instantdb.com"}})))
        (is (false?
             (program {:etype "users"
                       :attrs {(str (resolvers/->uuid r :users/handle))
                               "stopa"
                               (str (resolvers/->uuid r :users/email))
                               "dww@instantdb.com"}})))))))

(deftest wacky-attr-names-and-values
  (testing "values with special characters"
    (let [edn '(= (get (:attrs entity) "field") "!@#$%^&*()")
          program (iqt/edn->program edn)]
      (is (true? (iqt/eval-topic-program program {:attrs {"field" "!@#$%^&*()"}})))))

  (testing "values with quotes"
    (let [edn '(= (get (:attrs entity) "field") "say \"hello\"")
          program (iqt/edn->program edn)]
      (is (true? (iqt/eval-topic-program program {:attrs {"field" "say \"hello\""}})))))

  (testing "values with newlines and tabs"
    (let [edn '(= (get (:attrs entity) "field") "line1\nline2\ttab")
          program (iqt/edn->program edn)]
      (is (true? (iqt/eval-topic-program program {:attrs {"field" "line1\nline2\ttab"}})))))

  (testing "values with backslashes"
    (let [edn '(= (get (:attrs entity) "path") "C:\\Users\\test")
          program (iqt/edn->program edn)]
      (is (true? (iqt/eval-topic-program program {:attrs {"path" "C:\\Users\\test"}})))))

  (testing "unicode values"
    (let [edn '(= (get (:attrs entity) "name") "日本語テスト")
          program (iqt/edn->program edn)]
      (is (true? (iqt/eval-topic-program program {:attrs {"name" "日本語テスト"}})))))

  (testing "emoji values"
    (let [edn '(= (get (:attrs entity) "status") "🎉 Party time! 🚀")
          program (iqt/edn->program edn)]
      (is (true? (iqt/eval-topic-program program {:attrs {"status" "🎉 Party time! 🚀"}})))))

  (testing "CEL injection-like values"
    (let [edn '(= (get (:attrs entity) "input") "\" && true || \"")
          program (iqt/edn->program edn)]
      (is (true? (iqt/eval-topic-program program {:attrs {"input" "\" && true || \""}}))))))
