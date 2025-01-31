(ns instant.nrepl
  (:require
   [cider.nrepl.middleware :refer [cider-middleware]]
   [clojure.java.io :as io]
   [instant.config :as config]
   [instant.util.tracer :as tracer]
   [nrepl.middleware :refer [set-descriptor!]]
   [nrepl.middleware.interruptible-eval :refer [interruptible-eval]]
   [nrepl.server :as nrepl-server :refer [start-server]]))

(defn record-nrepl-msg [msg]
  (tracer/record-info! {:name (str "nrepl/" (name (:op msg)))
                        :attributes (assoc (select-keys msg [:op
                                                             :id
                                                             :msg
                                                             :file
                                                             :code
                                                             :column
                                                             :line])
                                           :session-id (-> msg :session meta :id))}))

(defn wrap-record [handler]
  (fn [msg]
    (record-nrepl-msg msg)
    (handler msg)))

(set-descriptor! #'wrap-record {:requires #{}
                                :expects #{#'interruptible-eval}})

(def nrepl-middleware
  (let [refactor-middleware (try
                              (require 'refactor-nrepl.middleware)
                              (resolve 'refactor-nrepl.middleware/wrap-refactor)
                              (catch Exception _e nil))
        record-middleware (when (= :prod (config/get-env))
                            #'wrap-record)]
    (cond-> cider-middleware
      refactor-middleware (conj refactor-middleware)
      record-middleware (conj record-middleware))))

(def nrepl-handler
  "We build our own custom nrepl handler, mimicking CIDER's."
  (apply nrepl-server/default-handler nrepl-middleware))

(defn start []
  (let [port (config/get-nrepl-port)
        port-file (io/file ".nrepl-port")]
    (tracer/record-info! {:name "nrepl/start" :attributes {:port port}})
    (.deleteOnExit port-file)
    (def server
      (start-server (merge {:port port :handler nrepl-handler}
                           (when-let [bind (config/get-nrepl-bind-address)]
                             {:bind bind}))))
    (spit port-file port)))
