(ns instant.util.url
  (:require [lambdaisland.uri :as uri]))

(defn add-query-params [url-string params]
  (let [url (uri/uri url-string)]
    (str (uri/assoc-query* url params))))

(defn coerce-web-url [url-string]
  (let [url (uri/uri url-string)]
    (tool/def-locals)
    (when (and (contains? #{"http" "https"} (:scheme url))
               (:host url))
      url-string)))

(comment
  (add-query-params "https://example.com?a=b" {:c "d"})
  (add-query-params "https://example.com" {:c "https://test.com"})
  (add-query-params "https://example.com?c=https%3A%2F%2Ftest.com" {:d "e"}))
