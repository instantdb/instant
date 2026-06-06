(ns instant.util.id-generator
  "OpenTelemetry IdGenerator that encodes epoch seconds (big-endian) into the
   *last* 4 bytes of the trace ID. Lets us derive the trace's start time
   from the trace ID alone, which means we can pick the right Athena /
   CloudFront partition to query without scanning history.

   The timestamp is at the tail so that the visually-distinctive start of
   the trace ID is fully random — sibling traces in the same second still
   look different to the eye.

   Last 8 hex chars of a trace ID decode as epoch seconds:
     (Long/parseLong (subs trace-id 24) 16)"
  (:import
   (io.opentelemetry.sdk.trace IdGenerator)
   (java.time Instant)
   (java.util.concurrent ThreadLocalRandom)))

(set! *warn-on-reflection* true)

(def ^"[C" hex-digits (char-array "0123456789abcdef"))

(defn write-hex!
  "Write the low `nibbles` hex digits of `n` into `out` at `offset`,
   most-significant nibble first."
  [^chars out ^long offset ^long n ^long nibbles]
  (loop [i 0]
    (when (< i nibbles)
      (let [shift (* 4 (- nibbles 1 i))]
        (aset-char out (int (+ offset i))
                   (aget hex-digits
                         (int (bit-and (unsigned-bit-shift-right n shift) 0xf)))))
      (recur (inc i)))))

(defn generate-trace-id ^String []
  ;; 32 hex chars = 12 bytes random + 4 bytes epoch_seconds.
  ;; Pack as two longs: hi = random64,
  ;;                     lo = (random32 << 32) | epoch_seconds.
  (let [rnd (ThreadLocalRandom/current)
        now-secs (quot (System/currentTimeMillis) 1000)
        hi (.nextLong rnd)
        lo (bit-or (bit-shift-left (.nextLong rnd) 32)
                   (bit-and now-secs 0xFFFFFFFF))
        out (char-array 32)]
    (write-hex! out 0 hi 16)
    (write-hex! out 16 lo 16)
    (String. out)))

(def ^IdGenerator default-id-generator (IdGenerator/random))

(defn id-generator ^IdGenerator []
  (reify IdGenerator
    (generateSpanId [_] (.generateSpanId default-id-generator))
    (generateTraceId [_] (generate-trace-id))))

(defn trace-id->instant
  "Decode the epoch-second suffix of a trace ID into an Instant."
  ^Instant [^String trace-id]
  (Instant/ofEpochSecond (Long/parseLong (subs trace-id 24) 16)))
