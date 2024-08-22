(ns instant.data.emails
  (:require [instant.config :as config]
            [instant.db.model.attr :as attr-model]
            [instant.db.datalog :as d]
            [instant.jdbc.aurora :as aurora]))

(def null-emails {:test #{}
                  :team #{}
                  :friend #{}
                  :power-user #{}})

(defn get-emails []
  (if-let [app-id (config/instant-config-app-id)]
    (let [attrs (attr-model/get-by-app-id aurora/conn-pool app-id)
          get-attr-id (fn [n]
                        (:id (attr-model/seek-by-fwd-ident-name [n "email"]
                                                                attrs)))
          patterns [[:ea '_ (get-attr-id "friend-emails") '?friend]
                    [:ea '_ (get-attr-id "test-emails") '?test]
                    [:ea '_ (get-attr-id "team-emails") '?team]
                    [:ea '_ (get-attr-id "power-user-emails") '?power-user]]

          query-result (d/query {:app-id app-id
                                 :db {:conn-pool aurora/conn-pool}}
                                patterns)
          sym-values (fn [sym]
                       (get-in query-result [:symbol-values sym]))]
      (-> null-emails
          (assoc :friend (sym-values '?friend))
          (assoc :team (sym-values '?team))
          (assoc :test (sym-values '?test))
          (assoc :power-user (sym-values '?power-user))))
    null-emails))

(defn admin-email? [email]
  (contains? (:team (get-emails))
             email))
