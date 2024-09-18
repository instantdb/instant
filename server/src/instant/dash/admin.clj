(ns instant.dash.admin
  (:require
   [honey.sql :as hsql]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [clojure.core :as c]
   [instant.data.emails :refer [get-emails]]
   [instant.stripe :as stripe]
   [instant.model.app :as app-model]
   [instant.util.storage :as storage-util]))

;; Fetch our last 50 sign-ups. We want to
;; see whether people are finishing sign-up and
;; how they found us / what they're doing.
(defn excluded-emails []
  (let [{:keys [test team friend]} (get-emails)]
    (vec (concat test team friend))))

(defn get-recent
  ([]
   (get-recent aurora/conn-pool))
  ([conn]
   (sql/select conn
               ["SELECT
                   u.*,
                   a.app_created_at,
                   a2.title as app_title,
                   t.num_tx
                FROM (
                  SELECT
                     u.id,
                     u.email,
                     u.created_at as user_created_at,
                     ip.meta,
                     ip.created_at as profile_created_at
                   FROM instant_users u
                   LEFT JOIN instant_profiles ip ON u.id = ip.id
                   ORDER BY u.created_at DESC
                ) u
                LEFT JOIN (
                 SELECT a.creator_id, MIN(a.created_at) as app_created_at
                 FROM apps a
                 GROUP BY 1
                ) a ON a.creator_id = u.id
                LEFT JOIN apps a2 on a2.creator_id = a.creator_id AND a2.created_at = a.app_created_at
                LEFT JOIN (
                  SELECT app_id, COUNT(id) as num_tx
                  FROM transactions
                  GROUP BY 1
                ) t ON t.app_id = a2.id
                ORDER BY u.user_created_at DESC"])))

(defn get-top-users
  "Fetches the users with their transactions in the last `n` days."
  ([]
   (get-top-users aurora/conn-pool 7))
   ([n]
   (get-top-users aurora/conn-pool n))
  ([conn n]
   (let [interval (str n " days")]  ;; Create the interval string dynamically
     (sql/select conn
                 [(str "SELECT
                          u.email AS user_email,
                          a.title AS app_title,
                          COUNT(*) AS total_transactions
                        FROM transactions t
                        JOIN apps a ON t.app_id = a.id
                        JOIN instant_users u ON a.creator_id = u.id
                        WHERE u.email NOT IN (SELECT unnest(?::text[]))
                          AND t.created_at::date BETWEEN NOW() - INTERVAL '" interval "' AND NOW()
                        GROUP BY u.email, a.title
                        ORDER BY total_transactions DESC;")
                  (with-meta (excluded-emails) {:pgtype "text[]"})]))))

(defn get-paid
  ([] (get-paid aurora/conn-pool))
  ([conn]
   (let [subscriptions (stripe/subscriptions)]
     (sql/select conn
                 (hsql/format
                  {:with [[[:stripe-subs
                            {:columns [:subscription-id
                                       :monthly-revenue
                                       :start-timestamp]}]
                           {:values (keep (fn [s]
                                            (when (pos? (:monthly-revenue s))
                                              [(:subscription-id s)
                                               (:monthly-revenue s)
                                               (:start-timestamp s)]))
                                          subscriptions)}]]
                   :select [[:apps.title :app_title]
                            [:i_users.email :user_email]
                            :monthly-revenue
                            :start-timestamp
                            [{:select [[[:coalesce
                                         [:*
                                          [:sum [:pg_column_size :t]]
                                          [:case
                                           [:= [:pg_relation_size "triples"] 0] 1
                                           :else [:/
                                                  [:pg_total_relation_size "triples"]
                                                  [:pg_relation_size "triples"]]]]
                                         0]]]
                              :from [[:triples :t]]
                              :where [:= :t.app_id :apps.id]}
                             :usage]]
                   :from :stripe-subs
                   :join [[:instant_subscriptions :i_subs] [:=
                                                            :stripe-subs.subscription-id
                                                            :i_subs.stripe-subscription-id]
                          :apps [:= :i_subs.app_id :apps.id]
                          [:instant_users :i_users] [:= :i_subs.user_id :i_users.id]]
                   :order-by [[:start-timestamp :desc]]})))))

(defn format-app-storage-usage [{:keys [app-id app metrics]}]
  (merge app {:app_id app-id
              :total_byte_size (:total-byte-size metrics)
              :total_file_count (:total-file-count metrics)}))

(defn get-storage-metrics []
  (let [metrics-by-app-id (storage-util/calculate-app-metrics)
        app-ids (keys metrics-by-app-id)
        apps (app-model/get-with-creator-by-ids app-ids)
        apps-by-id (into {} (map (fn [app] [(str (:id app)) app]) apps))]
    (->> app-ids
         (map #(format-app-storage-usage
                {:app-id %
                 :app (apps-by-id %)
                 :metrics (metrics-by-app-id %)}))
         (sort-by :total_byte_size >))))

(comment
  (get-top-users)
  (get-paid)
  (get-storage-metrics))
