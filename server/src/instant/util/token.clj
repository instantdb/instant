(ns instant.util.token
  (:require [clojure.string :as string]
            [instant.util.crypt :as crypt-util]
            [instant.util.uuid :as uuid-util]))

(def platform-refresh-token-prefix "prt_")
(def platform-access-token-prefix "pat_")
(def personal-access-token-prefix "per_")

(deftype PlatformAccessToken [value]
  Object
  (toString [_] "<secret>"))

(deftype PersonalAccessToken [value]
  Object
  (toString [_] "<secret>"))

(defn platform-access-token-value [^PlatformAccessToken t]
  (.value t))

(defn personal-access-token-value [^PersonalAccessToken t]
  (.value t))

(defn is-platform-access-token? [t]
  (instance? PlatformAccessToken t))

(defn is-personal-access-token? [t]
  (instance? PersonalAccessToken t))

(defn is-platform-token? [t]
  (or (is-platform-access-token? t)
      (is-personal-access-token? t)))

(defn coerce-token-from-string [^String s]
  (cond (string/starts-with? s platform-access-token-prefix)
        (->PlatformAccessToken s)

        (string/starts-with? s personal-access-token-prefix)
        (->PersonalAccessToken s)

        :else
        (uuid-util/coerce s)))

(defn generate-platform-access-token []
  (str platform-access-token-prefix (crypt-util/random-hex 32)))

(defn generate-platform-refresh-token []
  (str platform-refresh-token-prefix (crypt-util/random-hex 32)))

(defn generate-personal-access-token []
  (str personal-access-token-prefix (crypt-util/random-hex 32)))
