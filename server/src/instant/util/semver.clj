(ns instant.util.semver
  (:require
   [clojure.string :as string]))

(def semver-re #"^[v]{0,1}(\d+)\.(\d+)\.(\d+)(-dev)?$")

(defn parse [v]
  (when-let [[_match major minor patch dev] (re-matches semver-re v)]
    {:major (parse-long major)
     :minor (parse-long minor)
     :patch (parse-long patch)
     :dev? (not (string/blank? dev))}))

(defn- compare-dev [v1 v2]
  (case [(:dev? v1) (:dev? v2)]
    ([true true] [false false]) 0
    ([false true]) -1
    ([true false]) 1))

(defn- compare-patch [v1 v2]
  (if (= (:patch v1)
         (:patch v2))
    (compare-dev v1 v2)
    (compare (:patch v1) (:patch v2))))

(defn- compare-minor [v1 v2]
  (if (= (:minor v1)
         (:minor v2))
    (compare-patch v1 v2)
    (compare (:minor v1) (:minor v2))))

(defn- compare-major [v1 v2]
  (if (= (:major v1)
         (:major v2))
    (compare-minor v1 v2)
    (compare (:major v1) (:major v2))))

(defn compare-semver [v1 v2]
  (let [v1 (if (string? v1)
             (parse v1)
             v1)
        v2 (if (string? v2)
             (parse v2)
             v2)]
    (when (not (map? v1))
      (throw (Exception. (format "Invalid semver version %s" v1))))
    (when (not (map? v2))
      (throw (Exception. (format "Invalid semver version %s" v2))))

    (compare-major v1 v2)))
