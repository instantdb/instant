(ns instant.totp
  (:require
   [instant.util.crypt :as crypt-util]
   [clojure.string])
  (:import
   (java.time Instant)))

;; Time step is 5 minutes (in seconds), which half the default expiration. If an
;; app accepts tokens for longer, we just check all of the previous 5 minute
;; intervals until we find a matching token or exceed the max time. In the worst
;; case (24 hours), we'll have to do 288 checks.
;; We can't change this without adding extra code for backwards compatibility
(def default-time-step 300)

(def digit-count 6)

;; TOTP generation follows the reference impl in https://www.rfc-editor.org/rfc/rfc6238#page-9

(defn left-pad [s len]
  (let [pad-len (- len (count s))]
    (if (pos? pad-len)
      (str (clojure.string/join (repeat pad-len "0")) s)
      s)))

(def digits-power
  [1
   10
   100
   1000
   10000
   100000
   1000000
   10000000
   100000000])

;; For use in testing
(def ^:dynamic *now* nil)

(defn generate-totp
  "Generates a TOTP code. For testing, it accepts the number of
   digits and a time step, but you should always use the default
   values in production."
  ([^bytes secret-key]
   (generate-totp secret-key (or *now* (Instant/now))))
  ([^bytes secret-key ^Instant time]
   (generate-totp secret-key time 6 default-time-step))
  ([^bytes secret-key ^Instant time code-digits time-step]
   (let [t (/ (.getEpochSecond time)
              time-step)
         t-bytes (-> t
                     (Long/toHexString)
                     (.toUpperCase)
                     (left-pad 16)
                     (crypt-util/hex-string->bytes))
         hash (crypt-util/hmac-256 secret-key t-bytes)
         offset (bit-and (aget hash (dec (alength hash)))
                         0xf)
         binary (bit-or
                 (bit-shift-left (bit-and (aget hash offset) 0x7f)
                                 24)
                 (bit-shift-left (bit-and (aget hash (+ offset 1)) 0xff)
                                 16)
                 (bit-shift-left (bit-and (aget hash (+ offset 2)) 0xff)
                                 8)
                 (bit-and (aget hash (+ offset 3)) 0xff))
         otp (mod binary (nth digits-power code-digits))]
     (left-pad (Integer/toString otp) code-digits))))

(defn valid-totp?
  "Returns true if the totp code is valid. Will go back up to max-10-minute-intervals."
  ([^bytes secret-key max-5-minute-intervals ^String code]
   (valid-totp? secret-key (or *now* (Instant/now)) max-5-minute-intervals code))
  ([^bytes secret-key
    ^Instant time
    max-5-minute-intervals
    ^String code]
   (loop [remaining-intervals max-5-minute-intervals
          time time]
     (when (pos? remaining-intervals)
       (if (crypt-util/constant-string= code (generate-totp secret-key time))
         true
         (recur (dec remaining-intervals)
                (.minusSeconds time default-time-step)))))))
