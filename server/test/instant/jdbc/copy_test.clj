(ns instant.jdbc.copy-test
  (:require
   [clojure.test :refer [deftest is]]
   [honey.sql :as hsql]
   [instant.config :as config]
   [instant.fixtures :refer [with-zeneca-app]]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.copy :as copy]
   [instant.jdbc.sql :as sql]
   [instant.jdbc.wal :refer [jdbc-password jdbc-username]]
   [next.jdbc.connection :refer [jdbc-url]])
  (:import
   (java.sql DriverManager)
   (java.time Instant)
   (java.util Properties)
   (org.postgresql PGProperty)
   (org.postgresql.jdbc PgConnection)))

(defn get-copy-conn
  "Creates a disposable connection for testing copy"
  ^PgConnection []
  (let [db-spec (config/get-aurora-config)
        props (Properties.)
        _ (do (.set PGProperty/USER props (jdbc-username db-spec))
              (.set PGProperty/PASSWORD props (jdbc-password db-spec))
              (.set PGProperty/REPLICATION props "database")
              (.set PGProperty/ASSUME_MIN_SERVER_VERSION props "9.4")
              (.set PGProperty/PREFER_QUERY_MODE props "simple"))
        conn (DriverManager/getConnection (jdbc-url (-> db-spec
                                                        (dissoc :user :password)))
                                          props)]
    (.unwrap conn PgConnection)))

(deftest copy-works-with-triples
  (with-zeneca-app
    (fn [app _r]
      (with-open [conn (get-copy-conn)]
        (let [reducer (copy/copy-reducer conn
                                         (format "copy (select app_id, entity_id, attr_id, value, value_md5, ea, eav, av, ave, vae, created_at, checked_data_type from triples where app_id = '%s') to stdout with (format binary)"
                                                 (:id app))
                                         [{:name :app_id
                                           :pgtype "uuid"}
                                          {:name :entity_id
                                           :pgtype "uuid"}
                                          {:name :attr_id
                                           :pgtype "uuid"}
                                          {:name :value
                                           :pgtype "jsonb"}
                                          {:name :value_md5
                                           :pgtype "text"}
                                          {:name :ea
                                           :pgtype "boolean"}
                                          {:name :eav
                                           :pgtype "boolean"}
                                          {:name :av
                                           :pgtype "boolean"}
                                          {:name :ave
                                           :pgtype "boolean"}
                                          {:name :vae
                                           :pgtype "boolean"}
                                          {:name :created_at
                                           :pgtype "bigint"}
                                          {:name :checked_data_type
                                           :pgtype "checked_data_type"}])
              copy-rows (persistent!
                         (reduce (fn [rows row]
                                   (conj! rows row))
                                 (transient [])
                                 reducer))
              select-rows (mapv (fn [row]
                                  (update row :checked_data_type keyword))
                                (sql/select (aurora/conn-pool :read)
                                            (hsql/format {:select [:app_id
                                                                   :entity_id
                                                                   :attr_id
                                                                   :value
                                                                   :value_md5
                                                                   :ea
                                                                   :eav
                                                                   :av
                                                                   :ave
                                                                   :vae
                                                                   :created_at
                                                                   :checked_data_type]
                                                          :from :triples
                                                          :where [:= :app-id :?app_id]}
                                                         {:params {:app_id (:id app)}})))]
          (is (= (set select-rows)
                 (set copy-rows))))))))

(deftest throws-on-invalid-query
  (with-open [conn (get-copy-conn)]
    (is (thrown-with-msg? Exception
                          #"binary format"
                          (reduce (fn [x _row]
                                    x)
                                  0
                                  (copy/copy-reducer conn
                                                     "copy config to stdout"
                                                     []))))))

(deftest handles-all-of-the-types
  (with-open [conn (get-copy-conn)]
    (let [query "copy (select 'ab3f1923-f604-49c2-bfa0-b30e062db84c'::uuid as uuid,
                              'text'::text as text,
                              '{\"json\": [null, 1, true, 5.0]}'::json as json,
                              '{\"json\": [null, 1, true, 5.0]}'::jsonb as jsonb,
                              '123456'::jsonb as jsonb_number,
                              '123456'::json as json_number,
                              triples_extract_date_value('0'::jsonb)::timestamptz as timestamptz,
                              true::boolean as boolean,
                              1::int as integer,
                              99999999999999999::bigint as bigint,
                              'date'::checked_data_type as checked_data_type) to stdout (format binary)"
          result (reduce (fn [_ row]
                           row)
                         nil
                         (copy/copy-reducer conn query [{:name :uuid
                                                         :pgtype "uuid"}
                                                        {:name :text
                                                         :pgtype "text"}
                                                        {:name :json
                                                         :pgtype "json"}
                                                        {:name :jsonb
                                                         :pgtype "jsonb"}
                                                        {:name :jsonb_number
                                                         :pgtype "jsonb"}
                                                        {:name :json_number
                                                         :pgtype "json"}
                                                        {:name :timestamptz
                                                         :pgtype "timestamptz"}
                                                        {:name :boolean
                                                         :pgtype "boolean"}
                                                        {:name :integer
                                                         :pgtype "integer"}
                                                        {:name :bigint
                                                         :pgtype "bigint"}
                                                        {:name :checked_data_type
                                                         :pgtype "checked_data_type"}]))]
      (is (= result {:uuid #uuid "ab3f1923-f604-49c2-bfa0-b30e062db84c"
                     :text "text"
                     :json {"json" [nil 1 true 5.0]}
                     :jsonb {"json" [nil 1 true 5.0]}
                     :json_number 123456
                     :jsonb_number 123456
                     :timestamptz (Instant/parse "1970-01-01T00:00:00Z")
                     :boolean true
                     :integer 1
                     :bigint 99999999999999999
                     :checked_data_type :date})))))

(def copy-in-columns
  [{:name :uuid
    :pgtype "uuid"}
   {:name :text
    :pgtype "text"}
   {:name :json
    :pgtype "json"}
   {:name :jsonb
    :pgtype "jsonb"}
   {:name :timestamptz
    :pgtype "timestamptz"}
   {:name :boolean
    :pgtype "boolean"}
   {:name :integer
    :pgtype "integer"}
   {:name :bigint
    :pgtype "bigint"}])

(defn create-copy-in-test-table! [conn]
  (sql/do-execute!
   conn
   ["create temp table copy_in_test (
       uuid uuid,
       text text,
       json json,
       jsonb jsonb,
       timestamptz timestamptz,
       boolean boolean,
       integer integer,
       bigint bigint
     )"]))

(deftest copy-in-rows-round-trips-supported-types
  (with-open [conn (get-copy-conn)]
    (create-copy-in-test-table! conn)
    (let [rows [{:uuid #uuid "ab3f1923-f604-49c2-bfa0-b30e062db84c"
                 :text "first"
                 :json {"json" [nil 1 true 5.0]}
                 :jsonb {"jsonb" {"nested" ["value"]}}
                 :timestamptz (Instant/parse "2024-01-02T03:04:05.123456Z")
                 :boolean true
                 :integer 123
                 :bigint 99999999999999999}
                {:uuid #uuid "52844a42-82d5-4a77-99ca-68038a2c1e77"
                 :text "second"
                 :json [1 2 3]
                 :jsonb {"k" "v"}
                 :timestamptz (Instant/parse "1970-01-01T00:00:00Z")
                 :boolean false
                 :integer -456
                 :bigint -99999999999999999}]
          inserted (copy/copy-in-rows
                    conn
                    "copy copy_in_test (uuid, text, json, jsonb, timestamptz, boolean, integer, bigint) from stdin with (format binary)"
                    copy-in-columns
                    rows)
          copied-back (vec
                       (copy/copy-seq
                        conn
                        "copy (select uuid, text, json, jsonb, timestamptz, boolean, integer, bigint from copy_in_test order by text) to stdout with (format binary)"
                        copy-in-columns))]
      (is (= 2 inserted))
      (is (= rows copied-back)))))

(deftest copy-in-rows-distinguishes-sql-null-from-json-null
  (with-open [conn (get-copy-conn)]
    (create-copy-in-test-table! conn)
    (is (= 1
           (copy/copy-in-rows
            conn
            "copy copy_in_test (uuid, text, json, jsonb, timestamptz, boolean, integer, bigint) from stdin with (format binary)"
            copy-in-columns
            [{:uuid #uuid "ab3f1923-f604-49c2-bfa0-b30e062db84c"
              :text nil
              :json nil
              :jsonb nil
              :timestamptz nil
              :boolean nil
              :integer nil
              :bigint nil}])))
    (is (= [{:text_is_null true
             :json_is_sql_null false
             :jsonb_is_sql_null false
             :json_type "null"
             :jsonb_type "null"
             :timestamptz_is_null true
             :boolean_is_null true
             :integer_is_null true
             :bigint_is_null true}]
           (sql/select conn
                       ["select text is null as text_is_null,
                                json is null as json_is_sql_null,
                                jsonb is null as jsonb_is_sql_null,
                                json_typeof(json) as json_type,
                                jsonb_typeof(jsonb) as jsonb_type,
                                timestamptz is null as timestamptz_is_null,
                                boolean is null as boolean_is_null,
                                integer is null as integer_is_null,
                                bigint is null as bigint_is_null
                           from copy_in_test"])))))
