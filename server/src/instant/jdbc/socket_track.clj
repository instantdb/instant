(ns instant.jdbc.socket-track
  (:import
   (com.google.common.collect MapMaker)
   (com.zaxxer.hikari HikariDataSource)
   (com.zaxxer.hikari.pool HikariProxyConnection)
   (instant.socketutil CountingSocket)
   (java.util UUID)
   (java.util.concurrent ConcurrentMap)
   (org.postgresql.jdbc PgConnection))
  (:gen-class
   :name instant.jdbc.SocketTrack
   :main false
   :methods [^{:static true} [addsocket [instant.socketutil.CountingSocket] void]]))

(def ^:dynamic *connection-id* nil)

;; WeakMap to store connection-id -> Socket
;; Autoevicts when the socket is GC'd
(defonce socket-map (-> (MapMaker.)
                        (.weakValues)
                        (.makeMap)))

;; WeakMap to store PgConnection -> connection-id
;; Autoevicts when the connection is GC'd
(defonce connection-map (-> (MapMaker.)
                            (.weakKeys)
                            (.makeMap)))

(defn socket-for-connection
  "Gets the socket for the connection, unwrapping the connection
   to get the underlying PgConnection if necessary."
  ^CountingSocket [conn]
  (when-let [conn (cond (instance? HikariProxyConnection conn)
                        (.unwrap ^HikariProxyConnection conn PgConnection)

                        (instance? PgConnection conn)
                        conn

                        (instance? HikariDataSource conn)
                        (.unwrap ^HikariDataSource conn PgConnection)

                        :else nil)]
    (when-let [conn-id (ConcurrentMap/.get connection-map conn)]
      (ConcurrentMap/.get socket-map conn-id))))

(defn add-connection [^UUID connection-id ^PgConnection connection]
  (ConcurrentMap/.put connection-map connection connection-id))

;; Exposed through the gen-class as instant.jdbc.SocketTrack.addsocket
(defn -addsocket [^CountingSocket s]
  (when-let [conn-id *connection-id*]
    (ConcurrentMap/.put socket-map conn-id s)
    nil))

(defn bytes-transferred
  "Gets the total number of bytes transferrred through the socket
   for a given database connection (will unwrap Hikari proxies to get
   the underlying PgConnection)."
  [conn]
  (when-let [socket (socket-for-connection conn)]
    {:read (.getBytesRead socket)
     :write (.getBytesWritten socket)}))
