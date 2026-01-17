(ns instant.model.app-authorized-redirect-origin
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as string]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.util.tracer :as tracer]
   [lambdaisland.uri :as uri]
   [instant.util.exception :as ex])
  (:import
   (java.util UUID)))

(defn add!
  ([params] (add! (aurora/conn-pool :write) params))
  ([conn {:keys [app-id service params]}]
   (let [id (UUID/randomUUID)]
     (sql/execute-one!
      conn
      ["INSERT INTO app_authorized_redirect_origins
       (id, app_id, service, params)
       VALUES (?::uuid, ?::uuid, ?, ?::text[])"
       id app-id service (with-meta params {:pgtype "text[]"})]))))

(defn delete-by-id!
  ([params] (delete-by-id! (aurora/conn-pool :write) params))
  ([conn {:keys [id app-id]}]
   (sql/execute-one!
    conn
    ["DELETE FROM app_authorized_redirect_origins WHERE id = ?::uuid AND app_id = ?::uuid"
     id app-id])))

(defn delete-by-id-ensure!
  [& args]
  (let [record (apply delete-by-id! args)]
    (ex/assert-record! record :app-authorized-redirect-origin {:args args})))

(defn get-all-for-app
  ([params] (get-all-for-app (aurora/conn-pool :read) params))
  ([conn {:keys [app-id]}]
   (sql/select
    conn
    ["SELECT * FROM app_authorized_redirect_origins WHERE app_id = ?::uuid" app-id])))

(def reserved-uri-schemes (edn/read-string (slurp (io/resource "uri-schemes.edn"))))

;; PR format, deploy-preview-42--yoursitename.netlify.app
;; deploy id format, 1234abcd12acde000111cdef--yoursitename.netlify.app
;; live url format, e3757530--yoursitename.netlify.live
(defn matches-netlify? [host [site-name]]
  (when (or (string/ends-with? host "netlify.app")
            (string/ends-with? host "netlify.live"))
    (when-let [[_ matched-site-name] (or (re-matches #"^.+--(.+)\.netlify\.(?:app|live)$" host)
                                         (re-matches #"^(.+)\.netlify\.app$" host))]
      (= site-name matched-site-name))))

;; https://vercel.com/docs/deployments/generated-urls
;; All vercel urls start with the project-name and end with the deployment suffix
;; (usually vercel.app)
(defn matches-vercel? [host [deployment-suffix project-name]]
  (and (string/ends-with? host deployment-suffix)
       (string/starts-with? host project-name)))

(defn matches-generic? [host [host-param]]
  (= host host-param))

(defn matches-custom-scheme? [uri-scheme [scheme]]
  (and (not (contains? reserved-uri-schemes uri-scheme))
       (= scheme uri-scheme)))

(defn find-match [site-origins url]
  (let [parsed-url (uri/uri url)
        raw-host (:host parsed-url)
        port (:port parsed-url)
        host (if (string/blank? port)
               (str raw-host)
               (str raw-host ":" port))]
    (first (filter (fn [{:keys [service params]}]
                     (case service
                       "netlify" (matches-netlify? host params)
                       "vercel" (matches-vercel? host params)
                       "generic" (matches-generic? host params)
                       "custom-scheme" (matches-custom-scheme? (:scheme parsed-url)
                                                               params)
                       (tracer/with-span! {:name "origins/unknown-service"
                                           :attributes {:service service}})))
                   site-origins))))

(defn validation-error [service params]
  (case service
    "netlify" (or (when (not= 1 (count params))
                    "Netlify should have only the site name param.")
                  (when-not (every? string? params)
                    "Netlify site-name should be a string."))
    "vercel" (or (when (not= 2 (count params))
                   "Vercel should have deployment suffix and project name params.")
                 (when-not (every? string? params)
                   "Vercel deployment suffix and project name should both be strings."))
    "generic" (or (when (not= 1 (count params))
                    "Host should be the only parameter.")
                  (when-not (every? string? params)
                    "Host should be a string."))
    "custom-scheme" (or (when (not= 1 (count params))
                          "Custom scheme should have only one parameter.")
                        (when-not (every? string? params)
                          "Custom scheme should be a string.")
                        (when (contains? reserved-uri-schemes (first params))
                          (str "The scheme `" (first params) "` is not allowed.")))
    (str "Unrecognized service " service)))

(comment
  (add! {:app-id (UUID/fromString "3cc5c5c8-07df-42b2-afdc-6a04cbf0c40a")
         :service "netlify"
         :params ["site-name"]})

  (add! {:app-id (UUID/fromString "3cc5c5c8-07df-42b2-afdc-6a04cbf0c40a")
         :service "vercel"
         :params ["vercel.app", "some-vercel-site"]})

  (add! {:app-id (UUID/fromString "3cc5c5c8-07df-42b2-afdc-6a04cbf0c40a")
         :service "generic"
         :params ["example.com"]})

  (add! {:app-id (UUID/fromString "3cc5c5c8-07df-42b2-afdc-6a04cbf0c40a")
         :service "custom-scheme"
         :params ["expo-instant"]})

  (get-all-for-app {:app-id (UUID/fromString "3cc5c5c8-07df-42b2-afdc-6a04cbf0c40a")})

  (find-match (get-all-for-app {:app-id (UUID/fromString "3cc5c5c8-07df-42b2-afdc-6a04cbf0c40a")})
              "https://example.com")

  (find-match (get-all-for-app {:app-id (UUID/fromString "3cc5c5c8-07df-42b2-afdc-6a04cbf0c40a")})
              "https://random-website.com")

  (find-match (get-all-for-app {:app-id (UUID/fromString "3cc5c5c8-07df-42b2-afdc-6a04cbf0c40a")})
              "expo-instant://")

  (find-match (get-all-for-app {:app-id (UUID/fromString "3cc5c5c8-07df-42b2-afdc-6a04cbf0c40a")})
              ""))
