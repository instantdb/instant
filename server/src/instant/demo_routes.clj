(ns instant.demo-routes
  (:require
   [compojure.core :refer [GET defroutes]]
   [hiccup2.core :as h]))

(def page
  (let [script-a "document.querySelector('#box-a').style.backgroundColor = 'green'"
        script-b "document.querySelector('#box-b').style.backgroundColor = 'red'"]
    {:status 200
     :headers {"content-type" "text/html"}
     :inline-scripts [script-a]
     :body (str (h/html (h/raw "<!DOCTYPE html>")
                        [:html {:lang "en"}
                         [:head
                          [:meta {:charset "UTF-8"}]
                          [:meta {:name "viewport"
                                  :content "width=device-width, initial-scale=1.0"}]
                          [:title "Test redirect"]
                          [:style "
                             body {
                               margin: 0;
                               height: 100vh;
                               display: flex;
                               justify-content: center;
                               align-items: center;
                               background-color: white;
                               flex-direction: column;
                               font-family: sans-serif;
                             }

                             a.button {
                               text-decoration: none;
                               padding: 15px 30px;
                               font-size: 18px;
                               border-radius: 5px;
                               font-family: sans-serif;
                               text-align: center;
                             }

                             a {
                               cursor: pointer;
                             }

                             @media (prefers-color-scheme: dark) {
                               body {
                                 background-color: black;
                               }
                               a.button {
                                 color: black;
                                 background-color: white;
                               }
                             }

                             @media (prefers-color-scheme: light) {
                               a.button {
                                 color: white;
                                 background-color: black;
                               }
                             }"]]
                         [:body
                          [:center
                           [:p {:style {:max-width "500px"}}
                            "If the content-security policy works, both boxes should be green and the console should log an error about a missing hash " [:span {:style {:white-space "nowrap"}} "(sha256-yC+Lxzy8GEAXIWLTR7eqO1JY49aqduKqltQP1FCf0y0=)."]]]
                          [:p "Whitelisted script:"]
                          [:div {:id "box-a"
                                 :style {:width "250px"
                                         :height "250px"
                                         :background-color "red"}}]
                          [:p "Non-whitelisted script:"]
                          [:div {:id "box-b"
                                 :style {:width "250px"
                                         :height "250px"
                                         :background-color "green"}}]
                          [:script {:type "text/javascript"} (h/raw script-a)]
                          [:script {:type "text/javascript"} (h/raw script-b)]]]))}))

(defn get-csp-demo [_req]
  page)

(defroutes routes
  (GET "/demo/csp" [] get-csp-demo))
