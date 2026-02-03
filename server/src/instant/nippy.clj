(ns instant.nippy
  (:require
   [instant.grpc]
   [instant.isn]
   [taoensso.nippy :as nippy])
  (:import
   (instant.grpc StreamComplete StreamContent StreamError StreamFile StreamInit StreamRequest)
   (instant.isn ISN)
   (java.io DataInput DataOutput)
   (java.util UUID)
   (org.postgresql.replication LogSequenceNumber)))

;; -------
;; helpers

(defn write-uuid [^DataOutput data-output ^UUID uuid]
  (.writeLong data-output (.getMostSignificantBits uuid))
  (.writeLong data-output (.getLeastSignificantBits uuid)))

(defn read-uuid [^DataInput data-input]
  (UUID. (.readLong data-input)
         (.readLong data-input)))

;; --------------
;; nippy encoders

;; These encoders are used to transfer messages between machines.
;; If you need to change anything, you must do a 2-phase deploy

;; 1 is our custom identifier for LogSequenceNumber, no other type can use it and
;; it must be the same across all machines.
(nippy/extend-freeze LogSequenceNumber 1 [^LogSequenceNumber lsn data-output]
  (.writeLong data-output (.asLong lsn)))

(nippy/extend-thaw 1 [data-input]
  (LogSequenceNumber/valueOf (.readLong data-input)))

;; 2 is our custom identifier for ISN, no other type can use it and
;; it must be the same across all machines.
(nippy/extend-freeze ISN 2 [^ISN isn data-output]
  (.writeInt data-output (.slot_num isn))
  (.writeLong data-output (.asLong ^LogSequenceNumber (.lsn isn))))

(nippy/extend-thaw 2 [data-input]
  (instant.isn/->ISN (.readInt data-input)
                     (LogSequenceNumber/valueOf (.readLong data-input))))

;; 3 is our custom identifier for StreamRequest, no other type can use it and
;; it must be the same across all machines.
(nippy/extend-freeze StreamRequest 3 [^StreamRequest {:keys [^UUID app-id
                                                             ^UUID stream-id
                                                             ^long offset]}
                                      data-output]
  (write-uuid data-output app-id)
  (write-uuid data-output stream-id)
  (#'nippy/write-long data-output offset))

(nippy/extend-thaw 3 [data-input]
  (instant.grpc/->StreamRequest (read-uuid data-input)
                                (read-uuid data-input)
                                (nippy/thaw-from-in! data-input)))

;; 4 is our custom identifier for StreamFile, no other type can use it and
;; it must be the same across all machines.
(defn write-file [^StreamFile {:keys [^UUID id
                                      ^long size
                                      ^String location-id]}
                  ^DataOutput data-output]
  (write-uuid data-output id)
  (.writeLong data-output size)
  (#'nippy/write-str data-output location-id))

(nippy/extend-freeze StreamFile 4 [^StreamFile obj data-output]
  (write-file obj data-output))

(defn read-file [^DataInput data-input]
  (let [id (read-uuid data-input)
        size (.readLong data-input)
        location-id (nippy/thaw-from-in! data-input)]
    (instant.grpc/->StreamFile id location-id size)))

(nippy/extend-thaw 4 [data-input]
  (read-file data-input))

;; 5 is our custom identifier for StreamInit, no other type can use it and
;; it must be the same across all machines.

;; When we freeze, we combine all of the chunks into one chunk.
(defn write-chunks
  "Writes chunks to the stream, where `chunks` is an array of byte arrays.
   Combines all of the chunks into a single chunk"
  [^DataOutput data-output chunks]
  (let [byte-size (reduce (fn [acc ^bytes chunk]
                            (+ acc (alength chunk)))
                          0
                          chunks)]
    (#'nippy/write-long data-output byte-size)
    (doseq [^bytes chunk chunks]
      (.write data-output chunk))))

(nippy/extend-freeze StreamInit 5 [^StreamInit {:keys [^long offset files chunks]}
                                   data-output]
  (#'nippy/write-long data-output offset)
  (#'nippy/write-long data-output (count files))
  (doseq [file files]
    (write-file file data-output))
  (write-chunks data-output chunks))

(defn read-chunks [^DataInput data-input]
  (let [byte-len (nippy/thaw-from-in! data-input)]
    (if (zero? byte-len)
      []
      (let [chunk (byte-array byte-len)]
        (.readFully data-input chunk)
        [chunk]))))

(nippy/extend-thaw 5 [data-input]
  (let [offset (nippy/thaw-from-in! data-input)
        file-count (nippy/thaw-from-in! data-input)
        files (mapv (fn [_]
                      (read-file data-input))
                    (range file-count))
        chunks (read-chunks data-input)]
    (tool/def-locals)
    (instant.grpc/->StreamInit offset files chunks)))

;; 6 is our custom identifier for StreamContent, no other type can use it and
;; it must be the same across all machines.
(nippy/extend-freeze StreamContent 6 [^StreamContent {:keys [offset chunks]}
                                      data-output]
  (#'nippy/write-long data-output offset)
  (write-chunks data-output chunks))

(nippy/extend-thaw 6 [data-input]
  (let [offset (nippy/thaw-from-in! data-input)
        chunks (read-chunks data-input)]
    (instant.grpc/->StreamContent offset chunks)))

;; 7 is our custom identifier for StreamError, no other type can use it and
;; it must be the same across all machines.
(nippy/extend-freeze StreamError 7 [^StreamError {:keys [error]} data-output]
  (#'nippy/write-long data-output (get instant.grpc/stream-error-map error -1)))

(nippy/extend-thaw 7 [data-input]
  (let [error-id (nippy/thaw-from-in! data-input)
        error (get instant.grpc/stream-error-id-map error-id :unknown)]
    (instant.grpc/->StreamError error)))

;; 8 is our custom identifier for StreamComplete, no other type can use it and
;; it must be the same across all machines.
(nippy/extend-freeze StreamComplete 8 [^StreamComplete _ data-output])

(nippy/extend-thaw 8 [data-input]
  (instant.grpc/->StreamComplete))
