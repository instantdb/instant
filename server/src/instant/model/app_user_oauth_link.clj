(ns instant.model.app-user-oauth-link
  (:require [instant.jdbc.aurora :as aurora]
            [instant.system-catalog-ops :refer [update-op]]))

(def etype "$oauthUserLinks")

(defn create!
  ([params] (create! (aurora/conn-pool :write) params))
  ([conn {:keys [id app-id sub provider-id user-id]}]
   (update-op
    conn
    {:app-id app-id
     :etype etype}
    (fn [{:keys [transact! resolve-id get-entity]}]
      (transact! [[:add-triple id (resolve-id :id) id]
                  [:add-triple id (resolve-id :sub) sub]
                  [:add-triple id (resolve-id :$user) user-id]
                  [:add-triple id (resolve-id :$oauthProvider) provider-id]
                  [:add-triple id (resolve-id :sub+$oauthProvider) (format "%s+%s"
                                                                           sub
                                                                           provider-id)]])
      (get-entity id)))))
