(ns instant.jdbc.socket-track
  (:import
   (com.google.common.collect MapMaker)
   (com.zaxxer.hikari HikariDataSource)
   (com.zaxxer.hikari.pool HikariProxyConnection)
   (instant CountingSocket)
   (java.util UUID)
   (java.util.concurrent ConcurrentMap)
   (org.postgresql.jdbc PgConnection))
  (:gen-class
   :name instant.jdbc.SocketTrack
   :main false
   :methods [^{:static true} [addsocket [instant.CountingSocket] void]]))

(def ^:dynamic *connection-id* nil)

(defonce socket-map (-> (MapMaker.)
                        (.weakValues)
                        (.makeMap)))

(defonce connection-map (-> (MapMaker.)
                            (.weakKeys)
                            (.makeMap)))

(defn socket-for-connection ^CountingSocket [conn]
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

(defn -addsocket [^CountingSocket s]
  (when-let [conn-id *connection-id*]
    (ConcurrentMap/.put socket-map conn-id s)
    nil))

(defn bytes-transferred [conn]
  (when-let [socket (socket-for-connection conn)]
    {:read (.getBytesRead socket)
     :write (.getBytesWritten socket)}))
