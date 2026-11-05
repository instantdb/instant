(ns instant.jdbc.wal-test
  (:require
   [clojure.test :refer [deftest is]]
   [instant.config :as config]
   [instant.flags :as flags]
   [instant.jdbc.sql :as sql]
   [instant.jdbc.wal :as wal]))

(defn- replication-conn-logical-decoding-work-mem []
  (with-open [conn (#'wal/get-pg-replication-conn (config/get-aurora-config))]
    (:logical_decoding_work_mem
     (sql/select-one ::show conn ["show logical_decoding_work_mem"]))))

(deftest replication-conn-sets-logical-decoding-work-mem
  (is (= "64MB" (replication-conn-logical-decoding-work-mem)))
  (binding [flags/*flag-overrides* {:logical-decoding-work-mem-kb (* 32 1024)}]
    (is (= "32MB" (replication-conn-logical-decoding-work-mem)))))
