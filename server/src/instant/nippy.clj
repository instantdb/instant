(ns instant.nippy
  (:require
   [instant.grpc]
   [instant.isn]
   [taoensso.nippy :as nippy])
  (:import
   (instant.grpc InvalidatorSubscribe PackedWalRecord SlotDisconnect StreamAborted StreamComplete StreamContent StreamError StreamFile StreamInit StreamRequest WalRecord)
   (instant.isn ISN)
   (instant.jdbc WalColumn WalEntry)
   (java.io DataInput DataOutput)
   (java.time Instant)
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

(defn write-isn [^ISN isn ^DataOutput data-output]
  (.writeInt data-output (.slot_num isn))
  (.writeLong data-output (.asLong ^LogSequenceNumber (.lsn isn))))

(defn read-isn ^ISN [^DataInput data-input]
  (instant.isn/->ISN (.readInt data-input)
                     (LogSequenceNumber/valueOf (.readLong data-input))))

;; 2 is our custom identifier for ISN, no other type can use it and
;; it must be the same across all machines.
(nippy/extend-freeze ISN 2 [^ISN isn data-output]
  (write-isn isn data-output))

(nippy/extend-thaw 2 [data-input]
  (read-isn data-input))

;; 3 is our custom identifier for StreamRequest, no other type can use it and
;; it must be the same across all machines.
(nippy/extend-freeze StreamRequest 3 [^StreamRequest {:keys [^UUID app-id
                                                             ^UUID stream-id
                                                             ^long offset]}
                                      data-output]
  (write-uuid data-output app-id)
  (write-uuid data-output stream-id)
  (nippy/freeze-to-out! data-output offset))

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
  (nippy/freeze-to-out! data-output size)
  (nippy/freeze-to-out! data-output location-id))

(nippy/extend-freeze StreamFile 4 [^StreamFile obj data-output]
  (write-file obj data-output))

(defn read-file [^DataInput data-input]
  (let [id (read-uuid data-input)
        size (nippy/thaw-from-in! data-input)
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
    (nippy/freeze-to-out! data-output byte-size)
    (doseq [^bytes chunk chunks]
      (.write data-output chunk))))

(nippy/extend-freeze StreamInit 5 [^StreamInit {:keys [^long offset files chunks]}
                                   data-output]
  (nippy/freeze-to-out! data-output offset)
  (nippy/freeze-to-out! data-output (count files))
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
    (instant.grpc/->StreamInit offset files chunks)))

;; 6 is our custom identifier for StreamContent, no other type can use it and
;; it must be the same across all machines.
(nippy/extend-freeze StreamContent 6 [^StreamContent {:keys [offset chunks]}
                                      data-output]
  (nippy/freeze-to-out! data-output offset)
  (write-chunks data-output chunks))

(nippy/extend-thaw 6 [data-input]
  (let [offset (nippy/thaw-from-in! data-input)
        chunks (read-chunks data-input)]
    (instant.grpc/->StreamContent offset chunks)))

;; 7 is our custom identifier for StreamError, no other type can use it and
;; it must be the same across all machines.
(nippy/extend-freeze StreamError 7 [^StreamError {:keys [error]} data-output]
  (nippy/freeze-to-out! data-output (get instant.grpc/stream-error-map error -1)))

(nippy/extend-thaw 7 [data-input]
  (let [error-id (nippy/thaw-from-in! data-input)
        error (get instant.grpc/stream-error-id-map error-id :unknown)]
    (instant.grpc/->StreamError error)))

;; 8 is our custom identifier for StreamComplete, no other type can use it and
;; it must be the same across all machines.
(nippy/extend-freeze StreamComplete 8 [^StreamComplete _ _data-output])

(nippy/extend-thaw 8 [_data-input]
  (instant.grpc/->StreamComplete))

;; 9 is our custom identifier for StreamAborted, no other type can use it and
;; it must be the same across all machines.
(nippy/extend-freeze StreamAborted 9 [^StreamAborted {:keys [abort-reason]} data-output]
  (nippy/freeze-to-out! data-output abort-reason))

(nippy/extend-thaw 9 [data-input]
  (instant.grpc/->StreamAborted (nippy/thaw-from-in! data-input)))

;; 10 is our custom identifier for WalColumn, no other type can use it and
;; it must be the same across all machines.

(nippy/extend-freeze WalColumn 10 [^WalColumn c data-output]
  (nippy/freeze-to-out! data-output (.name c))
  (nippy/freeze-to-out! data-output (.value c)))

(nippy/extend-thaw 10 [data-input]
  (WalColumn. (nippy/thaw-from-in! data-input) ; name
              (nippy/thaw-from-in! data-input))) ; value

;; 11 is our custom identifier for WalEntry, no other type can use it and
;; it must be the same across all machines.

(nippy/extend-freeze WalEntry 11 [^WalEntry c data-output]
  (nippy/freeze-to-out! data-output (.action c))
  (nippy/freeze-to-out! data-output (.txBytes c))
  (nippy/freeze-to-out! data-output (.table c))
  (nippy/freeze-to-out! data-output (.columns c))
  (nippy/freeze-to-out! data-output (.identity c))
  (nippy/freeze-to-out! data-output (.prefix c))
  (nippy/freeze-to-out! data-output (.content c))
  (nippy/freeze-to-out! data-output (.lsn c))
  (nippy/freeze-to-out! data-output (.nextlsn c)))

(nippy/extend-thaw 11 [data-input]
  (WalEntry. (nippy/thaw-from-in! data-input) ; action
             (nippy/thaw-from-in! data-input) ; txBytes
             (nippy/thaw-from-in! data-input) ; table
             (nippy/thaw-from-in! data-input) ; columns
             (nippy/thaw-from-in! data-input) ; identity
             (nippy/thaw-from-in! data-input) ; prefix
             (nippy/thaw-from-in! data-input) ; content
             (nippy/thaw-from-in! data-input) ; lsn
             (nippy/thaw-from-in! data-input))) ; nextlsn

;; 12 is our custom identifier for WalRecord, no other type can use it and
;; it must be the same across all machines.
(nippy/extend-freeze WalRecord 12 [^WalRecord {:keys [^UUID app-id
                                                      ^long tx-id
                                                      ^ISN isn
                                                      ^ISN previous-isn
                                                      ^Instant tx-created-at
                                                      ^long tx-bytes
                                                      ^LogSequenceNumber nextlsn
                                                      attr-changes
                                                      ident-changes
                                                      triple-changes
                                                      messages
                                                      wal-logs]}
                                   data-output]
  (nippy/with-cache
    (write-uuid data-output app-id)
    (nippy/freeze-to-out! data-output tx-id)
    (nippy/freeze-to-out! data-output isn)
    (nippy/freeze-to-out! data-output previous-isn)
    (nippy/freeze-to-out! data-output tx-created-at)
    (nippy/freeze-to-out! data-output tx-bytes)
    (nippy/freeze-to-out! data-output nextlsn)
    (nippy/freeze-to-out! data-output attr-changes)
    (nippy/freeze-to-out! data-output ident-changes)
    (nippy/freeze-to-out! data-output triple-changes)
    (nippy/freeze-to-out! data-output messages)
    (nippy/freeze-to-out! data-output wal-logs)))

(nippy/extend-thaw 12 [data-input]
  (nippy/with-cache
    (instant.grpc/->WalRecord (read-uuid data-input) ; app-id
                              (nippy/thaw-from-in! data-input) ; tx-id
                              (nippy/thaw-from-in! data-input) ; isn
                              (nippy/thaw-from-in! data-input) ; previous-isn
                              (nippy/thaw-from-in! data-input) ; tx-created-at
                              (nippy/thaw-from-in! data-input) ; tx-bytes
                              (nippy/thaw-from-in! data-input) ; nextlsn
                              (nippy/thaw-from-in! data-input) ; attr-changes
                              (nippy/thaw-from-in! data-input) ; ident-changes
                              (nippy/thaw-from-in! data-input) ; triple-changes
                              (nippy/thaw-from-in! data-input) ; messages
                              (nippy/thaw-from-in! data-input)))) ; wal-logs

;; 13 is our custom identifier for SlotDisconnect, no other type can use it and
;; it must be the same across all machines.
(nippy/extend-freeze SlotDisconnect 13 [^SlotDisconnect _ _data-output])

(nippy/extend-thaw 13 [_data-input]
  (instant.grpc/->SlotDisconnect))

;; 14 is our custom identifier for PackedWalRecord, no other type can use it and
;; it must be the same across all machines.
(nippy/extend-freeze PackedWalRecord 14 [^PackedWalRecord r data-output]
  (nippy/freeze-to-out! data-output (:ba r)))

(nippy/extend-thaw 14 [data-input]
  (instant.grpc/->PackedWalRecord (nippy/thaw-from-in! data-input)))

;; 15 is our custom identifier for InvalidatorSubscribe, no other type can use it and
;; it must be the same across all machines.
(nippy/extend-freeze InvalidatorSubscribe 15 [^InvalidatorSubscribe {:keys [machine-id
                                                                            process-id]}
                                              data-output]
  (write-uuid data-output machine-id)
  (nippy/freeze-to-out! data-output process-id))

(nippy/extend-thaw 15 [data-input]
  (instant.grpc/->InvalidatorSubscribe (read-uuid data-input)
                                       (nippy/thaw-from-in! data-input)))
