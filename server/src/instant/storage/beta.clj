(ns instant.storage.beta
  (:require
   [instant.config :as config]
   [instant.flags :as flags]
   [instant.util.exception :as ex]))

(defn assert-storage-enabled! [app-id]
  (if (= :prod (config/get-env))
    (ex/assert-permitted! :storage-enabled? app-id (not (flags/storage-disabled? app-id)))
    true))
