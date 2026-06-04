(ns instant.db.model.triple-test
  (:require [instant.db.model.triple :as triple]
            [instant.db.model.attr :as attr-model]
            [instant.fixtures :refer [with-empty-app]]
            [instant.jdbc.aurora :as aurora]
            [instant.jdbc.sql :as sql]
            [instant.util.test :as test-util]
            [instant.util.json :refer [->json]]
            [honey.sql :as hsql]
            [clojure.test :refer [is deftest testing]])
  (:import
   (java.time Instant)
   (java.util Date)))

(defn extract-pg-date [s]
  (let [query {:select [[[:triples_extract_date_value [:cast (->json s) :jsonb]]
                         :date]]}]
    (-> (sql/select-one ::parse-date-value
                        (aurora/conn-pool :read)
                        (hsql/format query)
                        {:postgres-config [{:setting "timezone"
                                            :value "UTC"}]})
        :date
        (Date/.toInstant))))

(deftest parse-date-value-works-for-valid-dates
  (doseq [s ["Sat, 05 Apr 2025 18:00:31 GMT"
             "2025-01-01T00:00:00Z"
             "2025-01-01"
             "2025-01-02T00:00:00-08"
             "\"2025-01-02T00:00:00-08\""
             "2025-01-15 20:53:08.200"
             "2025-01-15 20:53:08.892865"
             "\"2025-01-15 20:53:08\""
             "Wed Jul 09 2025"
             "8/4/2025, 11:02:31 PM"
             "2024-12-30 20:19:41.892865+00"
             "epoch"
             "infinity"
             "-infinity"
             "Mon Feb 24 2025 22:37:27 GMT+0000"
             "\t2025-03-02T16:08:53Z"
             "2024-05-29 01:51:06.11848+00"
             "2025-03-01T16:08:53+0000"
             "2025-12-31 21:11"
             "04-17-2025"
             "2025-06-12T10:56:31.924+0530"
             "2025-08-7T00:00:00.000Z"
             "2024-12-30 20:19:41.892865+00"
             "72026-07-01"
             "2025-06-05T17:00:00EST"
             "2025-06-05T17:00:00PDT"
             "2025-06-05T17:00:00CETDST"
             "2025-06-05T17:00:00CET"
             "3/12/4444"
             "2025-9-29T23:59:59.999Z"
             "2026-04-28T04:7:00.000Z"
             "2026-04-28T4:07:00.000Z"
             "2026-04-28T04:07:7.000Z"
             ]]
    (testing (str "Date string `" s "` parses.")
      (let [pg-date (extract-pg-date s)]
        (is (= pg-date
               (triple/parse-date-value s))
            (format "parse-date-value for `%s` should return `%s`" s pg-date))))))

(deftest special-strings-work
  (let [base-time (Instant/parse "2025-08-11T18:42:30.157666Z")]
    (testing "now"
      (is (= base-time (triple/parse-date-value "now" base-time))))
    (testing "today"
      (is (= (Instant/parse "2025-08-11T00:00:00Z")
             (triple/parse-date-value "today" base-time))))
    (testing "tomorrow"
      (is (= (Instant/parse "2025-08-12T00:00:00Z")
             (triple/parse-date-value "tomorrow" base-time))))
    (testing "yesterday"
      (is (= (Instant/parse "2025-08-10T00:00:00Z")
             (triple/parse-date-value "yesterday" base-time)))))
  (testing "doesn't require a base time"
    (is (not (nil? (triple/parse-date-value "now"))))))

(deftest parse-date-value-throws-for-invalid-dates
  (doseq [s ["2025-01-0"
             "\"2025-01-0\""]]
    (is (thrown-with-msg? Exception #"Unable to parse" (triple/parse-date-value s)))))

(defn- result-pairs [rows]
  (set (map (juxt :entity_id :attr_id) rows)))

(deftest insert-multi-skips-same-value-updates
  (with-empty-app
    (fn [{app-id :id}]
      (let [{id-attr :items/id
             title-attr :items/title}
            (test-util/make-attrs app-id [[:items/id :unique? :index?]
                                          [:items/title]])
            attrs (attr-model/get-by-app-id app-id)
            conn (aurora/conn-pool :write)
            eid (random-uuid)]
        (triple/insert-multi! conn attrs app-id [[eid id-attr eid]
                                                 [eid title-attr "first"]])

        (testing "a fully no-op transaction writes nothing, not even the id triple"
          (is (= #{}
                 (result-pairs
                  (triple/insert-multi! conn attrs app-id [[eid id-attr eid]
                                                           [eid title-attr "first"]])))))
        (is (= #{[eid title-attr]}
               (result-pairs
                (triple/insert-multi! conn attrs app-id [[eid title-attr "second"]]))))
        (testing "overwrite-t rewrites everything (incl id) even when unchanged"
          (is (= #{[eid id-attr] [eid title-attr]}
                 (result-pairs
                  (triple/insert-multi! conn attrs app-id [[eid id-attr eid]
                                                           [eid title-attr "second"]]
                                        {:overwrite-t true})))))))))

(deftest insert-multi-writes-id-marker-only-when-entity-changes
  (with-empty-app
    (fn [{app-id :id}]
      (let [{id-attr :items/id
             title-attr :items/title
             pet-attr :items/pet}
            (test-util/make-attrs app-id [[:items/id :unique? :index?]
                                          [:items/title]
                                          [[:items/pet :pets/owner] :many]])
            attrs (attr-model/get-by-app-id app-id)
            conn (aurora/conn-pool :write)
            eid (random-uuid)
            pet (random-uuid)]
        (testing "creating an entity inserts the id triple"
          (is (= #{[eid id-attr] [eid title-attr]}
                 (result-pairs
                  (triple/insert-multi! conn attrs app-id [[eid id-attr eid]
                                                           [eid title-attr "first"]])))))
        (testing "a real value change re-writes the id triple (the webhook update marker)"
          (is (= #{[eid id-attr] [eid title-attr]}
                 (result-pairs
                  (triple/insert-multi! conn attrs app-id [[eid id-attr eid]
                                                           [eid title-attr "second"]])))))
        (testing "adding a new ref re-writes the id triple"
          (is (= #{[eid id-attr] [eid pet-attr]}
                 (result-pairs
                  (triple/insert-multi! conn attrs app-id [[eid id-attr eid]
                                                           [eid pet-attr pet]])))))
        (testing "re-sending the same ref (and id) changes nothing"
          (is (= #{}
                 (result-pairs
                  (triple/insert-multi! conn attrs app-id [[eid id-attr eid]
                                                           [eid pet-attr pet]])))))
        (testing "sending only the id triple for an existing entity is a no-op"
          (is (= #{}
                 (result-pairs
                  (triple/insert-multi! conn attrs app-id [[eid id-attr eid]])))))))))
