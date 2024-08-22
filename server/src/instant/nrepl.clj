(ns instant.nrepl
  (:require
   [cider.nrepl]
   [cider.nrepl.middleware :refer [cider-middleware]]
   [nrepl.server :as nrepl-server :refer [start-server]]
   [instant.config :as config] 
   [clojure.java.io :as io]
   [instant.util.tracer :as tracer]))

(def nrepl-handler
  "We build our own custom nrepl handler, mimicking CIDER's."
  (apply
   nrepl-server/default-handler
   (if-let [wrap-refactor (try
                            (require 'refactor-nrepl.middleware)
                            (resolve 'refactor-nrepl.middleware/wrap-refactor)
                            (catch Exception _e nil))]
     (conj cider-middleware wrap-refactor)
     cider-middleware)))

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
