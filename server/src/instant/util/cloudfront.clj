(ns instant.util.cloudfront
  (:require [instant.util.json :as json])
  (:import (java.security PrivateKey Signature)
           (org.apache.commons.codec.binary Base64)
           (java.time Duration Instant)))

(def ^String alphabet "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-~")

(def ^Base64 b64-encoder (-> (Base64/builder)
                             (.setEncodeTable (.getBytes alphabet "UTF-8"))
                             (.setPadding (byte \_))
                             (.get)))

(defn sign-cloudfront-url [{:keys [url key-id
                                   ^PrivateKey private-key
                                   ^Instant signing-instant
                                   ^Duration duration]}]
  (let [url-with-cache (str url "?response-cache-control=public%2C%20max-age%3D86400%2C%20immutable")
        policy {:Statement [{:Resource url-with-cache
                             :Condition {:DateLessThan {:AWS:EpochTime (+ (.getEpochSecond signing-instant)
                                                                          (.toSeconds duration))}}}]}
        policy-bytes (.getBytes ^String (json/->json policy) "UTF-8")
        signer (doto (Signature/getInstance "SHA1withRSA")
                 (.initSign private-key)
                 (.update policy-bytes))
        sig (.sign signer)

        encoded-policy (.encodeAsString b64-encoder policy-bytes)
        encoded-sig (.encodeAsString b64-encoder sig)]
    (str url-with-cache
         "&Policy=" encoded-policy
         "&Signature=" encoded-sig
         "&Key-Pair-Id=" key-id)))
