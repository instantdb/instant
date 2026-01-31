(ns instant.nippy
  (:require
   [instant.grpc]
   [instant.isn]
   [taoensso.nippy :as nippy])
  (:import
   (instant.grpc StreamContent StreamError StreamFile StreamInit StreamMissing StreamRequest)
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
(nippy/extend-freeze StreamRequest 3 [^StreamRequest {:keys [^UUID app-id ^UUID stream-id]}
                                      data-output]
  (write-uuid data-output app-id)
  (write-uuid data-output stream-id))

(nippy/extend-thaw 3 [data-input]
  (instant.grpc/->StreamRequest (read-uuid data-input)
                                (read-uuid data-input)))

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
(nippy/extend-freeze StreamInit 5 [^StreamInit {:keys [files]}
                                   data-output]
  (#'nippy/write-long data-output (count files))
  (doseq [file files]
    (write-file file data-output)))

(nippy/extend-thaw 5 [data-input]
  (let [count (nippy/thaw-from-in! data-input)
        files (mapv (fn [_]
                      (read-file data-input))
                    (range count))]
    (instant.grpc/->StreamInit files)))

;; 6 is our custom identifier for StreamContent, no other type can use it and
;; it must be the same across all machines.

;; When we freeze, we combine all of the chunks into one chunk.
(nippy/extend-freeze StreamContent 6 [^StreamContent {:keys [offset chunks]}
                                      data-output]
  (#'nippy/write-long data-output offset)
  (let [byte-size (reduce (fn [acc ^bytes chunk]
                            (+ acc (alength chunk)))
                          0
                          chunks)]
    (#'nippy/write-long data-output byte-size)
    (doseq [^bytes chunk chunks]
      (.write data-output chunk))))

(nippy/extend-thaw 6 [data-input]
  (let [offset (nippy/thaw-from-in! data-input)
        byte-len (nippy/thaw-from-in! data-input)
        chunk (byte-array byte-len)]
    (.readFully data-input chunk)
    (instant.grpc/->StreamContent offset [chunk])))

;; 7 is our custom identifier for StreamError, no other type can use it and
;; it must be the same across all machines.
(nippy/extend-freeze StreamError 7 [^StreamError _ data-output])

(nippy/extend-thaw 7 [data-input]
  (instant.grpc/->StreamError))


;; 8 is our custom identifier for StreamMissing, no other type can use it and
;; it must be the same across all machines.
(nippy/extend-freeze StreamMissing 8 [^StreamMissing _ data-output])

(nippy/extend-thaw 8 [data-input]
  (instant.grpc/->StreamMissing))
