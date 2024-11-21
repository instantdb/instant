#!/usr/bin/env bb

(require '[babashka.pods :as pods])

(pods/load-pod 'org.babashka/lanterna {:version "0.0.1"
                                       :transport :socket})

(require '[clojure.string :as string]
         '[pod.babashka.lanterna.terminal :as terminal]
         '[babashka.process :refer [shell exec]]
         '[cheshire.core :as json])

(defn get-current-version []
  (let [{:keys [out]}
        (apply shell
               {:out :string
                :err :string
                :continue true}
               "aws elasticbeanstalk describe-environments --region us-east-1 --environment-name Instant-docker-prod-env-2"
               *command-line-args*)]
    (when-not (string/blank? out)
      (-> (json/parse-string out)
          (get "Environments")
          first
          (get "VersionLabel")))))


(defn get-application-versions []
  (let [{:keys [out err exit]}
        (apply shell
               {:out :string
                :err :string
                :continue true}
               "aws elasticbeanstalk describe-application-versions --region us-east-1 --application-name instant-docker-prod"
               *command-line-args*)]
    (when-not (string/blank? err)
      (println "Error fetching application versions:")
      (println err)
      (System/exit exit))
    (get (json/parse-string out)
         "ApplicationVersions")))

(defn safe-subs [s len]
  (subs s 0 (min len (count s))))

(defn render-versions [term versions current-version-label selected-idx]
  (let [[width height] (terminal/get-size term)
        i (atom -1)
        offset (+ (count versions) 2)]
    (terminal/put-string term
                         (str "Choose version to deploy (enter to select, q to quit):")
                         0 (- height offset))
    (doseq [{:strs [Description VersionLabel]} versions
            :let [idx (swap! i inc)
                  y (- height (- offset
                                 (inc idx)))]]
      (terminal/put-string term (safe-subs (str " "
                                                (if (= idx selected-idx)
                                                  "●"
                                                  "○")
                                                " " (safe-subs VersionLabel 15)
                                                " | " (when (= current-version-label VersionLabel)
                                                        "* ")
                                                Description)
                                           (dec width))
                           0 y))
    ;; move-cursor isn't implemented, so this is the best alternative
    (terminal/put-string term " " 0 (- height (- offset (inc selected-idx))))
    (terminal/flush term)))

(defn deploy [version]
  (println "Deploying " (get version "VersionLabel") " " (get version "Description"))
  (Thread/sleep 500)
  (apply exec
         (str "eb deploy instant-docker-prod-env --version " (get version "VersionLabel"))
         *command-line-args*))

(defn main-loop []
  (sun.misc.Signal/handle
   (sun.misc.Signal. "INT")
   (reify sun.misc.SignalHandler (handle [_ _]
                                   (System/exit 1))))


  (println "Fetching application versions...")
  (let [current-version-future (future (get-current-version))
        versions (take 10 (get-application-versions))
        current-version-label @current-version-future
        term (terminal/get-terminal :auto)
        selected-idx (atom 0)
        render (fn []
                 (render-versions term
                                  versions
                                  current-version-label
                                  @selected-idx))]
    (terminal/start term)

    (render)

    (loop [k (terminal/get-key-blocking term)]
      (case k
        :up (swap! selected-idx (fn [i]
                                  (mod (dec i) (count versions))))

        :down (swap! selected-idx (fn [i]
                                    (mod (inc i) (count versions))))

        \q (do (terminal/stop term)
               (System/exit 0))

        :enter (do (terminal/stop term)
                   (deploy (nth versions @selected-idx))
                   (System/exit 0))

        nil)
      (render)
      (recur (terminal/get-key-blocking term)))


    (terminal/stop term)))

(main-loop)
