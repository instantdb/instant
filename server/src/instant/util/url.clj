(ns instant.util.url
  (:require [clojure.string :as string]
            [lambdaisland.uri :as uri]))

(defn add-query-params [url-string params]
  (let [url (uri/uri url-string)]
    (str (uri/assoc-query* url params))))

(defn coerce-web-url [url-string]
  (let [url (uri/uri url-string)]
    (when (and (contains? #{"http" "https"} (:scheme url))
               (:host url))
      url-string)))

(defn redirect-url-validation-errors [url-string & {:keys [allow-localhost?]}]
  (let [{:keys [user password path host scheme fragment]} (uri/uri url-string)
        localhost? (or (= host "localhost")
                       (= host "127.0.0.1"))]
    (seq (concat (when (or user password)
                   ["redirect uri may not contain user or password"])
                 (when (and path
                            (or (string/includes? path "/..")
                                (string/includes? path "\\.")))
                   ["redirect uri may not contain a path traversal"])
                 (when fragment
                   ["redirect uri may not contain the fragment component"])
                 (when (and localhost? (not allow-localhost?))
                   ["redirect uri may not be localhost"])
                 (when (and (not localhost?)
                            (not= "https" scheme))
                   ["redirect uri must use the HTTPS scheme"])
                 (when (and localhost?
                            (not (contains? #{"http" "https"} scheme)))
                   ["redirect uri must use either the HTTP or HTTPS scheme"])))))

(comment
  (add-query-params "https://example.com?a=b" {:c "d"})
  (add-query-params "https://example.com" {:c "https://test.com"})
  (add-query-params "https://example.com?c=https%3A%2F%2Ftest.com" {:d "e"}))
