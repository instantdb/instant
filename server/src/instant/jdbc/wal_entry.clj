(ns instant.jdbc.wal-entry
  "Parses a PGReplicationStream ByteBuffer containing a single wal2json
   format-version 2 entry directly into an `instant.jdbc.WalEntry`."
  (:import
   (com.fasterxml.jackson.core StreamReadConstraints)
   (com.fasterxml.jackson.databind DeserializationFeature ObjectMapper)
   (instant.jdbc WalColumn WalEntry)
   (java.io Writer)
   (java.nio ByteBuffer)))

(def ^:private ^ObjectMapper object-mapper
  (let [mapper (ObjectMapper.)]
    (.setStreamReadConstraints (.getFactory mapper)
                               (-> (StreamReadConstraints/builder)
                                   (.maxStringLength 200000000)
                                   (.build)))
    (.configure mapper DeserializationFeature/FAIL_ON_UNKNOWN_PROPERTIES false)
    mapper))

(defmethod print-method WalColumn [^WalColumn c ^Writer w]
  (.write w "#WalColumn{:name ")
  (print-method (.name c) w)
  (.write w ", :value ")
  (print-method (.value c) w)
  (.write w "}"))

(defmethod print-method WalEntry [^WalEntry e ^Writer w]
  (.write w "#WalEntry{:action ")
  (print-method (.action e) w)
  (.write w ", :tx-bytes ")
  (print-method (.txBytes e) w)
  (when-let [table (.table e)]
    (.write w ", :table ")
    (print-method table w))
  (when-let [columns (.columns e)]
    (.write w ", :columns ")
    (print-method columns w))
  (when-let [identity (.identity e)]
    (.write w ", :identity ")
    (print-method identity w))
  (when-let [prefix (.prefix e)]
    (.write w ", :prefix ")
    (print-method prefix w))
  (when-let [content (.content e)]
    (.write w ", :content ")
    (print-method content w))
  (when-let [lsn (.lsn e)]
    (.write w ", :lsn ")
    (.write w (str lsn)))
  (when-let [nextlsn (.nextlsn e)]
    (.write w ", :nextlsn ")
    (.write w (str nextlsn)))
  (.write w "}"))

(defn parse-buffer
  "Decodes a single wal2json format-version 2 entry from `buffer` into a
   fully-populated `instant.jdbc.WalEntry`."
  ^WalEntry [^ByteBuffer buffer]
  (let [src ^bytes (.array buffer)
        offset (.arrayOffset buffer)
        record-len (- (alength src) offset)
        ^WalEntry e (.readValue object-mapper src offset record-len WalEntry)]
    (set! (.txBytes e) record-len)
    e))
