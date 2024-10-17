(ns instant.util.test
  (:require [clojure.walk :as w]
            [instant.admin.model :as admin-model]
            [instant.db.instaql :as iq]
            [instant.db.model.attr :as attr-model]
            [instant.jdbc.aurora :as aurora]
            [instant.util.exception :as ex]
            [instant.db.datalog :as d])
  (:import [java.time Duration Instant]))

(defmacro instant-ex-data [& body]
  `(try
     ~@body
     (catch Exception e#
       (let [instant-ex# (ex/find-instant-exception e#)]
         (ex-data instant-ex#)))))

(defn pretty-perm-q [{:keys [app-id current-user]} q]
  (let [attrs (attr-model/get-by-app-id app-id)]
    (w/keywordize-keys
     (admin-model/instaql-nodes->object-tree
      {}
      attrs
      (iq/permissioned-query
       {:db {:conn-pool aurora/conn-pool}
        :app-id app-id
        :attrs attrs
        :datalog-query-fn d/query
        :current-user current-user}
       q)))))

(defn wait-for [wait-fn wait-ms]
  (let [start (Instant/now)]
    (loop [res (wait-fn)]
      (when-not res
        (if (< wait-ms (.toMillis (Duration/between start (Instant/now))))
          (throw (Exception. "Timed out in wait-for"))
          (do
            (Thread/sleep 100)
            (recur (wait-fn))))))))
