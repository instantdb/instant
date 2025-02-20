(ns instant.storage.beta
  (:require [instant.flags :as flags]
            [instant.config :as config]
            [instant.util.exception :as ex]))

(defn assert-storage-enabled! [app-id]
  (if (= :prod (config/get-env))
    (ex/assert-permitted! :storage-enabled? app-id (not (flags/storage-disabled? app-id)))
    true))
