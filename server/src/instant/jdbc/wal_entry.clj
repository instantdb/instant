(ns instant.jdbc.wal-entry
  "Parses a PGReplicationStream ByteBuffer containing a single wal2json
   format-version 2 entry directly into an `instant.jdbc.WalEntry`."
  (:import
   (com.fasterxml.jackson.core StreamReadConstraints)
   (com.fasterxml.jackson.databind DeserializationFeature ObjectMapper)
   (instant.jdbc WalEntry)
   (java.nio ByteBuffer)))

(def ^:private ^ObjectMapper object-mapper
  (let [mapper (ObjectMapper.)]
    (.setStreamReadConstraints (.getFactory mapper)
                               (-> (StreamReadConstraints/builder)
                                   (.maxStringLength 200000000)
                                   (.build)))
    (.configure mapper DeserializationFeature/FAIL_ON_UNKNOWN_PROPERTIES false)
    mapper))

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
