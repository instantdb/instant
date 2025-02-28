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
                         "Choose version to deploy (enter to select, q to quit):"
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
         (str "eb deploy Instant-docker-prod-env-2 --version " (get version "VersionLabel"))
         *command-line-args*))

(defn check-db [version]
  (let [[_ sha]        (re-matches #".*-([0-9a-fA-F]{40})$" (get version "VersionLabel"))
        _              (println "Fetching latest commits...")
        _              (shell "git" "fetch" "-q" "origin" "main")
        last-migration (->> (shell {:out :string} "git" "ls-tree" "-r" "--name-only" sha "resources/migrations")
                            :out
                            string/trim
                            string/split-lines
                            (keep #(second (re-matches #"resources/migrations/(\d+)_.*\.up\.sql" %)))
                            (map parse-long)
                            (reduce max 0))
        _              (println "Getting db URL...")
        db-url         (-> (shell {:out :string} "./scripts/prod_connection_string.sh")
                           :out
                           string/trim)
        _              (println "Checking prod db version...")
        db-version     (-> (shell {:err :string} "migrate" "-database" db-url "-path" "resources/migrations" "version")
                           :err
                           string/trim
                           parse-long)]
    (when (> last-migration db-version)
      (println "Looks like you need to run DB migrations first")
      (println "  Current prod version:" db-version)
      (println "      Latest migration:" last-migration)
      (loop []
        (print "Abort [a] / Continue [c]: ")
        (flush)
        (let [ch     (.read System/in)
              eof    -1
              ctrl-c 3
              ctrl-d 4]
          (println (char ch))
          (condp contains? ch
            #{(int \c) (int \C)}
            :continue

            #{(int \a) (int \A) eof ctrl-c ctrl-d}
            (System/exit 1)

            (recur)))))))

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

        :enter (let [version (nth versions @selected-idx)]
                 (terminal/stop term)
                 (check-db version)
                 (deploy version)
                 (System/exit 0))

        nil)
      (render)
      (recur (terminal/get-key-blocking term)))

    (terminal/stop term)))

(main-loop)
