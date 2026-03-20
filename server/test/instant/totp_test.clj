(ns instant.totp-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [instant.totp :as totp]
   [instant.util.crypt :as crypt-util])
  (:import
   (java.time Instant)))

(def secret-key (crypt-util/hex-string->bytes (str "3132333435363738393031323334353637383930"
                                                   "313233343536373839303132")))

(deftest totp-reference-impl
  ;; Tests against the reference implementation https://www.rfc-editor.org/rfc/rfc6238#page-14
  (doseq [[time expected] [[59 "46119246"]
                           [1111111109 "68084774"]
                           [1111111111 "67062674"]
                           [1234567890 "91819424"]
                           [2000000000 "90698825"]
                           [20000000000 "77737706"]]]
    (testing (format "%s -> %s" time expected)
      (is (= (totp/generate-totp secret-key (Instant/ofEpochMilli (* time 1000)) 8 30)
             expected)))))

(deftest totp-smoke-test
  (let [t0 (Instant/ofEpochMilli 1774046599905)
        code "508623"]
    (is (= code (totp/generate-totp secret-key t0)))
    (testing "valid for 5 minutes by default"
      (is (totp/valid-totp? secret-key t0 1 code))
      (is (not (totp/valid-totp? secret-key (.plusSeconds t0 (* 10 60)) 1 code))))

    (testing "can extend validity in 5 minute increments"
      (is (totp/valid-totp? secret-key (.plusSeconds t0 (* 9 60)) 3 code))
      (is (not (totp/valid-totp? secret-key (.plusSeconds t0 (* 16 60)) 3 code))))))
