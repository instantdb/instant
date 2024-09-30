(ns instant.storage.beta
  (:require [instant.flags :as flags]
            [instant.util.exception :as ex]))

(defn assert-storage-enabled! [app-id]
  (ex/assert-permitted! :storage-enabled? app-id (flags/storage-enabled? app-id)))
