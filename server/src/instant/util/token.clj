(ns instant.util.token
  (:require [clojure.string :as string]
            [instant.util.uuid :as uuid-util]))

(def platform-refresh-token-prefix "prt_")
(def platform-access-token-prefix "pat_")

(deftype PlatformAccessToken [value]
  Object
  (toString [_] "<secret>"))

(defn platform-access-token-value [^PlatformAccessToken t]
  (.value t))

(defn is-platform-access-token? [t]
  (or (instance? PlatformAccessToken t)
      (and (string? t)
           (string/starts-with? t platform-refresh-token-prefix))))

(defn coerce-token-from-string [^String s]
  (if (string/starts-with? s platform-access-token-prefix)
    (->PlatformAccessToken s)
    (uuid-util/coerce s)))
