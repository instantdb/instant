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
   "$magicCodes" "mc"
   "$userRefreshTokens" "ur"
   "$oauthProviders" "op"
   "$oauthUserLinks" "ol"
   "$oauthClients" "oc"
   "$oauthCodes" "co"
   "$oauthRedirects" "or"})

(def shortcodes-etype (map-invert etype-shortcodes))

(def label-shortcodes
  {"id" "id"
   "email" "email"
   "codeHash" "codehash"
   "$user" "user"
   "hashedToken" "hashedtok"
   "name" "name"
   "sub" "sub"
   "$oauthProvider" "oprovider"
   "sub+$oauthProvider" "subprovid"
   "clientId" "clientid"
   "encryptedClientSecret" "encclisec"
   "discoveryEndpoint" "discovend"
   "meta" "meta"
   "codeChallengeMethod" "cchalmeth"
   "codeChallengeHash" "cchalhash"
   "stateHash" "statehash"
   "cookieHash" "cookihash"
   "redirectUrl" "redireurl"
   "$oauthClient" "oauclient"})

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
  [(make-attr "$magicCodes" "id"
              :unique? true
              :index? true)
   (make-attr "$magicCodes" "codeHash"
              :unique? false
              :index? true)
   (make-attr "$magicCodes" "$user"
              :reverse-identity (get-ident-spec "$users" "$magicCodes")
              :index? true
              :value-type :ref)])

(def $user-refresh-token-attrs
  [(make-attr "$userRefreshTokens" "id"
              :unique? true
              :index? true)
   (make-attr  "$userRefreshTokens" "hashedToken"
              :unique? true
              :index? true)
   (make-attr "$userRefreshTokens" "$user"
              :reverse-identity (get-ident-spec "$users" "$userRefreshTokens")
              :index? true
              :value-type :ref)])

(def $oauth-provider-attrs
  [(make-attr "$oauthProviders" "id"
              :unique? true
              :index? true)
   (make-attr "$oauthProviders" "name"
              :unique? true
              :index? true)])

(def $user-oauth-link-attrs
  [(make-attr "$oauthUserLinks" "id"
              :unique? true
              :index? true)
   (make-attr "$oauthUserLinks" "sub"
              :unique? false
              :index? true)
   (make-attr "$oauthUserLinks" "$user"
              :reverse-identity (get-ident-spec "$users" "$oauthUserLinks")
              :index? true
              :value-type :ref)
   (make-attr "$oauthUserLinks" "$oauthProvider"
              :reverse-identity (get-ident-spec "$oauthProviders" "$oauthUserLinks")
              :index? true)
   ;; Trick to get a unique key on multiple attrs We have to manually
   ;; set it, but it would be nice if instant provided some sort of
   ;; computed column to do this automatically
   (make-attr "$oauthUserLinks" "sub+$oauthProvider"
              :unique? true
              :index? true)])

(def $oauth-client-attrs
  [(make-attr "$oauthClients" "id"
              :unique? true
              :index? true)
   (make-attr "$oauthClients" "$oauthProvider"
              :reverse-identity (get-ident-spec "$oauthProviders" "$oauthClients")
              :value-type :ref)
   (make-attr "$oauthClients" "name"
              :unique? true
              :index? true)
   (make-attr "$oauthClients" "clientId"
              :index? true)
   (make-attr "$oauthClients" "encryptedClientSecret")
   (make-attr "$oauthClients" "discoveryEndpoint")
   (make-attr "$oauthClients" "meta")])

(def $oauth-code-attrs
  [(make-attr "$oauthCodes" "id"
              :unique? true
              :index? true)
   (make-attr "$oauthCodes" "codeHash"
              :unique? true
              :index? true)
   (make-attr "$oauthCodes" "$user"
              :reverse-identity (get-ident-spec "$users" "$oauthCodes")
              :value-type :ref)
   (make-attr "$oauthCodes" "codeChallengeMethod")
   (make-attr "$oauthCodes" "codeChallengeHash")])

(def $oauth-redirect-attrs
  [(make-attr "$oauthRedirects" "id"
              :unique? true
              :index? true)
   (make-attr "$oauthRedirects" "stateHash"
              :unique? true
              :index? true)
   (make-attr "$oauthRedirects" "cookieHash"
              :unique? false
              :index? false)
   (make-attr "$oauthRedirects" "redirectUrl"
              :unique? false
              :index? false)
   (make-attr "$oauthRedirects" "$oauthClient"
              :reverse-identity (get-ident-spec "$oauthClients" "$oauthRedirects")
              :value-type :ref)
   (make-attr "$oauthRedirects" "codeChallengeMethod")
   (make-attr "$oauthRedirects" "codeChallengeHash")])

(def all-attrs (concat $users-attrs
                       $magic-code-attrs
                       $user-refresh-token-attrs
                       $oauth-provider-attrs
                       $user-oauth-link-attrs
                       $oauth-client-attrs
                       $oauth-code-attrs
                       $oauth-redirect-attrs))