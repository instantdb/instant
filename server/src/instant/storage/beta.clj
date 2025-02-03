(ns instant.storage.beta
  (:require [instant.flags :as flags]
            [instant.config :as config]
            [instant.util.exception :as ex]))

(defn whitelist []
  (flags/storage-enabled-whitelist))

(defn assert-storage-enabled! [app-id]
  (if (= :prod (config/get-env))
    (ex/assert-permitted! :storage-enabled? app-id (flags/storage-enabled? app-id))
    true))
