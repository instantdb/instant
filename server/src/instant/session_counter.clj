(ns instant.session-counter
  (:require
   [instant.util.json :refer [<-json]]
   [clojure.tools.logging :as log]
   [instant.util.tracer :as tracer]
   [instant.reactive.store :as rs]
   [instant.util.delay :as delay]
   [instant.util.async :as ua]
   [instant.lib.ring.websocket :as ws])
  (:import
   (java.util UUID)
   (java.util.concurrent ScheduledFuture)))

;; ------ 
;; Websocket 

(def websocket-listeners (atom {}))

(defn add-websocket-listener! [id ws]
  (swap! websocket-listeners assoc id ws))

(defn remove-websocket-listener! [id]
  (swap! websocket-listeners dissoc id))

(def api-key "7deea103-7ef8-43f4-aae6-519f51ef33ed")

(defn store->report [store]
  (->> (rs/report-active-sessions store)
       (filter :app-id)
       (map (juxt :app-id :app-title :creator-email))
       frequencies
       (map (fn [[[app-id app-title creator-email] count]]
              [app-id
               {:app-title app-title
                :creator-email creator-email
                :count count}]))
       (into {})))

(defn send-report! [report ws]
  (ws/send-json! nil {:op :report :report report} ws))

;; ------- 
;; Reporter 

(defonce delay-pool (delay/make-pool! :thread-count 1))

(defn straight-jacket-run-report []
  (let [ws-channels (vals @websocket-listeners)]
    (when (seq ws-channels)
      (tracer/with-span! {:name "session-counter/run-report"}
        (try
          (let [report (store->report rs/store)]
            (tracer/add-data! {:attributes
                               {:ws-count (count ws-channels)
                                :report-count (count report)}})
            (ua/pmap
             (fn [ws-conn] (send-report! report ws-conn))
             ws-channels))
          (catch Throwable e
            (tracer/add-exception! e {:escaping? false})))))))

(defn start []
  (tracer/record-info! {:name "session-counter/start"})
  (def ^ScheduledFuture report-job
    (delay/repeat-fn delay-pool
                     5000
                     #'straight-jacket-run-report)))

(defn stop []
  (ScheduledFuture/.cancel report-job true))

(defn restart []
  (stop)
  (start))

;; --------- 
;; Undertow 

(defn undertow-config []
  (let [ws-id (UUID/randomUUID)]
    {:undertow/websocket
     {:on-message (fn [{:keys [channel data]}]
                    (let [{:keys [token] :as msg} (<-json data true)]
                      (log/infof "[session-counters] new-message: %s" msg)
                      (if (= token api-key)
                        (do (add-websocket-listener! ws-id channel)
                            (send-report! (store->report rs/store) channel))
                        (ws/send-json! nil {:op :error
                                            :message "Invalid token"}
                                       channel))))
      :on-error (fn [{throwable :error}]
                  (remove-websocket-listener! ws-id)
                  (condp instance? throwable
                    java.net.SocketException nil
                    java.io.IOException nil
                    (tracer/record-exception-span!
                     throwable {:name "session-counter/on-error"
                                :attributes {:ws-id ws-id}
                                :escaping? false})))
      :on-close (fn [_]
                  (remove-websocket-listener! ws-id))}}))


