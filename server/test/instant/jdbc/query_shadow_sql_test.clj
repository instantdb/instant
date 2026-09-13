(ns instant.jdbc.query-shadow-sql-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [instant.jdbc.query-shadow :as query-shadow]
   [instant.jdbc.socket-track :as socket-track]
   [instant.jdbc.sql :as sql]
   [instant.util.tracer :as tracer]
   [next.jdbc :as jdbc]
   [next.jdbc.sql :as jdbc-sql])
  (:import
   (io.opentelemetry.api.trace Span)
   (java.lang AutoCloseable)
   (java.sql Connection PreparedStatement)))

(defn with-primary [f]
  (let [pool (Object.)
        closed? (atom false)
        prepared-opts (atom nil)
        rows [{:value 1}]
        connection (proxy [Connection] []
                     (isReadOnly [] true)
                     (close [] (reset! closed? true)))
        statement (proxy [PreparedStatement] []
                    (getUpdateCount [] -1)
                    (close [] nil))]
    (with-redefs [jdbc/get-connection (fn [_] connection)
                  jdbc/prepare (fn [_ _ opts] (reset! prepared-opts opts) statement)
                  jdbc-sql/query (fn [& _] rows)
                  socket-track/bytes-transferred (constantly nil)
                  tracer/new-span! (constantly (Span/getInvalid))
                  query-shadow/enabled? (constantly true)
                  sql/annotate-query-with-debug-info identity
                  sql/register-in-progress (fn [& _] (reify AutoCloseable (close [_])))]
      (f {:pool pool :connection connection :closed? closed?
          :prepared-opts prepared-opts :rows rows}))))

(deftest successful-primary-read-is-captured-after-completion
  (with-primary
    (fn [{:keys [pool connection closed? prepared-opts rows]}]
      (let [captured (atom nil)
            metadata {:origin :nested-read :app-id "test-app" :query-hash "test-query"}
            query ["select ?" 1]]
        (with-redefs [query-shadow/offer! (fn [& args] (reset! captured args))]
          (is (= rows (sql/select nil pool query {:shadow metadata}))))
        (is (= [metadata pool connection true query nil] (vec (take 6 @captured))))
        (is (number? (nth @captured 6)))
        (is (not (contains? @prepared-opts :shadow)))
        (is @closed?)))))

(deftest shadow-failure-does-not-change-the-primary-result
  (with-primary
    (fn [{:keys [pool closed? rows]}]
      (with-redefs [query-shadow/offer! (fn [& _] (throw (AssertionError. "capture failed")))]
        (is (= rows (sql/select nil pool ["select 1"] {:shadow {:origin :nested-read}})))
        (is @closed?)))))

(deftest unsuccessful-and-unmarked-queries-are-not-captured
  (with-primary
    (fn [{:keys [pool rows]}]
      (let [offers (atom 0)]
        (with-redefs [query-shadow/offer! (fn [& _] (swap! offers inc))]
          (testing "queries without an audited origin marker"
            (is (= rows (sql/select pool ["select 1"])))
            (is (zero? @offers)))
          (testing "a disabled trial adds no capture work"
            (with-redefs [query-shadow/enabled? (constantly false)]
              (is (= rows (sql/select nil pool ["select 1"] {:shadow {:origin :nested-read}}))))
            (is (zero? @offers)))
          (testing "a failed primary execution has no shadow work"
            (with-redefs [jdbc-sql/query (fn [& _] (throw (ex-info "primary failed" {})))]
              (is (thrown-with-msg? clojure.lang.ExceptionInfo #"primary failed"
                                    (sql/select nil pool ["select 1"]
                                                {:shadow {:origin :nested-read}}))))
            (is (zero? @offers))))))))

(deftest caller-owned-connection-stays-owned-by-the-caller
  (with-primary
    (fn [{:keys [connection closed? rows]}]
      (let [captured (atom nil)]
        (with-redefs [query-shadow/offer! (fn [& args] (reset! captured args))]
          (is (= rows (sql/select nil connection ["select 1"] {:shadow {:origin :nested-read}}))))
        (is (false? (nth @captured 3)))
        (is (false? @closed?))))))
