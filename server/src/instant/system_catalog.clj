(ns instant.system-catalog
  (:require [clojure.set :refer [map-invert]]
            [clojure.string :as string]))

;; ---------
;; Constants

;; Hardcoded app that holds the system catalog attributes.
;; It gets created by resources/migrations/34_hardcoded_objects.up.sql
(def system-catalog-app-id #uuid "a1111111-1111-1111-1111-111111111ca7")

;; Hardcoded user that holds the system catalog app.
;; It gets created by resources/migrations/34_hardcoded_objects.up.sql
(def system-catalog-user-id #uuid "e1111111-1111-1111-1111-111111111ca7")

;; -----------------------
;; UUID generation helpers

(def name-chars "abcdefghijklmnopqrstuvwxzy/")
(def char->bitstring
  (into {}
        (map-indexed
         (fn [i c]
           ;; 26 chars, so 5 bits to fit them all
           [c (format "%05d" (Integer/parseInt (Integer/toBinaryString i)))])
         name-chars)))

(def bitstring->char (map-invert char->bitstring))

(def etype-shortcodes
  {"$users" "us"
   "$magic-codes" "mc"
   "$user-refresh-tokens" "ur"
   "$oauth-providers" "op"
   "$user-oauth-links" "ol"
   "$oauth-clients" "oc"
   "$oauth-codes" "co"
   "$oauth-redirects" "or"})

(def shortcodes-etype (map-invert etype-shortcodes))

(def label-shortcodes
  {"id" "id"
   "email" "email"
   "code-hash" "codehash"
   "$user" "user"
   "hashed-token" "hashedtok"
   "name" "name"
   "sub" "sub"
   "$oauth-provider" "oprovider"
   "sub+$oauth-provider" "subprovid"
   "client-id" "clientid"
   "encrypted-client-secret" "encclisec"
   "discovery-endpoint" "discovend"
   "meta" "meta"
   "code-challenge-method" "cchalmeth"
   "code-challenge-hash" "cchalhash"
   "state-hash" "statehash"
   "cookie-hash" "cookihash"
   "redirect-url" "redireurl"
   "$oauth-client" "oauclient"})

(def shortcodes-label (map-invert label-shortcodes))

(defn encode-string->long [input]
  (assert (< (count input) 13))
  (let [base (apply str (map (fn [c] (char->bitstring c)) input))
        padded (apply str base (repeat (- 64 (count base)) "1"))]
    (.getLong (java.nio.ByteBuffer/wrap
               (byte-array (map (fn [x]
                                  (unchecked-byte (Integer/parseInt (apply str x) 2)))
                                (partition 8 padded)))))))

(def type-shortcodes {:attr "at"
                      :ident "id"})

(def shortcodes-type (map-invert type-shortcodes))

(defn encode-system-uuid [type etype label]
  (let [short-etype (get etype-shortcodes etype)
        short-label (or (get etype-shortcodes label)
                        (get label-shortcodes label))
        short-type (get type-shortcodes type)]
    (assert short-etype (str "Missing shortcode for etype " etype))
    (assert short-label (str "Missing shortcode for label " label))
    (assert short-type (str "Missing shortcode for type " type))
    (java.util.UUID. (encode-string->long (str "system" short-type))
                     (encode-string->long (format "%s/%s"
                                                  short-etype
                                                  short-label)))))

(defn decode-long->string [n]
  (let [base (Long/toBinaryString n)
        padded (str (apply str (repeat (- 64 (count base)) "0"))
                    base)]
    (->> padded
         (partition 5)
         (keep (fn [chars]
                 (when (not= chars '(\1 \1 \1 \1 \1))
                   (let [bitstring (apply str chars)]
                     (bitstring->char bitstring)))))
         (apply str))))

(defn decode-system-uuid [uuid]
  (let [system-str (decode-long->string (.getMostSignificantBits uuid))
        [etype-shortcode label-shortcode] (string/split (decode-long->string (.getLeastSignificantBits uuid))
                                                        #"\/")]
    {:catalog (subs system-str 0 (- (count system-str) 2))
     :type (get shortcodes-type (subs system-str (- (count system-str) 2)))
     :etype (get shortcodes-etype etype-shortcode)
     :label (get shortcodes-label label-shortcode)}))

;; ------------
;; system attrs

(defn get-attr-id [etype label]
  (encode-system-uuid :attr etype label))

(defn get-ident-spec [etype label]
  [(encode-system-uuid :ident etype label) etype label])

;; XXX: Need to insert inferred types when we set up the attrs
;;      Everything is a string except :meta
(defn make-attr [etype label & props]
  (merge {:id (get-attr-id etype label)
          :forward-identity (get-ident-spec etype label)
          :unique? false
          :index? false
          :value-type :blob
          :cardinality :one}
         (apply hash-map props)))

(def $users-attrs
  [(make-attr "$users" "id"
              :unique? true
              :index? true)
   (make-attr "$users" "email"
              :unique? true
              :index? true)])

(def $magic-code-attrs
  [(make-attr "$magic-codes" "id"
              :unique? true
              :index? true)
   (make-attr "$magic-codes" "code-hash"
              :unique? false
              :index? true)
   (make-attr "$magic-codes" "$user"
              :reverse-identity (get-ident-spec "$users" "$magic-codes")
              :index? true
              :value-type :ref)])

(def $user-refresh-token-attrs
  [(make-attr "$user-refresh-tokens" "id"
              :unique? true
              :index? true)
   (make-attr  "$user-refresh-tokens" "hashed-token"
              :unique? true
              :index? true)
   (make-attr "$user-refresh-tokens" "$user"
              :reverse-identity (get-ident-spec "$users" "$user-refresh-tokens")
              :index? true
              :value-type :ref)])

(def $oauth-provider-attrs
  [(make-attr "$oauth-providers" "id"
              :unique? true
              :index? true)
   (make-attr "$oauth-providers" "name"
              :unique? true
              :index? true)])

(def $user-oauth-link-attrs
  [(make-attr "$user-oauth-links" "id"
              :unique? true
              :index? true)
   (make-attr "$user-oauth-links" "sub"
              :unique? false
              :index? true)
   (make-attr "$user-oauth-links" "$user"
              :reverse-identity (get-ident-spec "$users" "$user-oauth-links")
              :index? true
              :value-type :ref)
   (make-attr "$user-oauth-links" "$oauth-provider"
              :reverse-identity (get-ident-spec "$oauth-providers" "$user-oauth-links")
              :index? true)
   ;; Trick to get a unique key on multiple attrs We have to manually
   ;; set it, but it would be nice if instant provided some sort of
   ;; computed column to do this automatically
   (make-attr "$user-oauth-links" "sub+$oauth-provider"
              :unique? true
              :index? true)])

(def $oauth-client-attrs
  [(make-attr "$oauth-clients" "id"
              :unique? true
              :index? true)
   (make-attr "$oauth-clients" "$oauth-provider"
              :reverse-identity (get-ident-spec "$oauth-providers" "$oauth-clients")
              :value-type :ref)
   (make-attr "$oauth-clients" "name"
              :unique? true
              :index? true)
   (make-attr "$oauth-clients" "client-id"
              :index? true)
   (make-attr "$oauth-clients" "encrypted-client-secret")
   (make-attr "$oauth-clients" "discovery-endpoint")
   (make-attr "$oauth-clients" "meta")])

(def $oauth-code-attrs
  [(make-attr "$oauth-codes" "id"
              :unique? true
              :index? true)
   (make-attr "$oauth-codes" "code-hash"
              :unique? true
              :index? true)
   (make-attr "$oauth-codes" "$user"
              :reverse-identity (get-ident-spec "$users" "$oauth-codes")
              :value-type :ref)
   (make-attr "$oauth-codes" "code-challenge-method")
   (make-attr "$oauth-codes" "code-challenge-hash")])

(def $oauth-redirects
  [(make-attr "$oauth-redirects" "id"
              :unique? true
              :index? true)
   (make-attr "$oauth-redirects" "state-hash"
              :unique? true
              :index? true)
   (make-attr "$oauth-redirects" "cookie-hash"
              :unique? false
              :index? false)
   (make-attr "$oauth-redirects" "redirect-url"
              :unique? false
              :index? false)
   (make-attr "$oauth-redirects" "$oauth-client"
              :reverse-identity (get-ident-spec "$oauth-clients" "$oauth-redirects")
              :value-type :ref)
   (make-attr "$oauth-redirects" "code-challenge-method")
   (make-attr "$oauth-redirects" "code-challenge-hash")])

(def all-attrs (concat $users-attrs
                       $magic-code-attrs
                       $user-refresh-token-attrs
                       $oauth-provider-attrs
                       $user-oauth-link-attrs
                       $oauth-client-attrs
                       $oauth-code-attrs
                       $oauth-redirects))
