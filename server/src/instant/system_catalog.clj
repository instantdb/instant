(ns instant.system-catalog
  (:require [clojure.set :refer [map-invert]]
            [clojure.string :as string]
            [instant.flags :as flags])
  (:import
   [java.util UUID]))

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
   "$oauthRedirects" "or"
   "$files" "fi"
   "$streams" "st"})

(def all-etypes (set (keys etype-shortcodes)))

(def shortcodes-etype (map-invert etype-shortcodes))

;; Must be 10 chars or shorter
(def label-shortcodes
  {"$files" "$files"
   "$oauthClient" "oauclient"
   "$oauthProvider" "oprovider"
   "$stream" "stream"
   "$user" "user"
   "abortReason" "abrtreasn"
   "authCode" "authcode"
   "clientId" "clientid"
   "codeChallenge" "codechall"
   "codeChallengeMethod" "cchalmeth"
   "codeHash" "codehash"
   "content-disposition" "cdisp"
   "content-type" "c-type"
   "cookieHash" "cookihash"
   "discoveryEndpoint" "discovend"
   "done" "done"
   "email" "email"
   "encryptedClientSecret" "encclisec"
   "hashedToken" "hashedtok"
   "id" "id"
   "imageURL" "imageurl"
   "key-version" "kv"
   "hashedReconnectToken" "hashretok"
   "linkedGuestUsers" "lgu"
   "linkedPrimaryUser" "lpu"
   "location-id" "lid"
   "machineId" "machineid"
   "meta" "meta"
   "name" "name"
   "path" "path"
   "redirectUrl" "redireurl"
   "redirectTo" "redirecto"
   "size" "size"
   "stateHash" "statehash"
   "sub" "sub"
   "sub+$oauthProvider" "subprovid"
   "type" "type"
   "url" "url"
   "userInfo" "userInfo"})

(def shortcodes-label (map-invert label-shortcodes))

(defn encode-string->long [input]
  (assert (< (count input) 13) {:input input :count (count input)})
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

(defn decode-system-uuid [^UUID uuid]
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

(defn make-attr [etype label & props]
  (merge {:id               (get-attr-id etype label)
          :forward-identity (get-ident-spec etype label)
          :unique?          false
          :index?           false
          :required?        false
          :value-type       :blob
          :cardinality      :one}
         (apply hash-map props)))

(def $users-linked-primary-user
  (make-attr "$users" "linkedPrimaryUser"
             :reverse-identity (get-ident-spec "$users" "linkedGuestUsers")
             :value-type :ref
             :on-delete :cascade
             :cardinality :one))

(def $users-attrs
  [(make-attr "$users" "id"
              :unique? true
              :index? true)
   (make-attr "$users" "email"
              :unique? true
              :index? true
              :checked-data-type :string)
   (make-attr "$users" "type"
              :checked-data-type :string)
   (make-attr "$users" "imageURL"
              :checked-data-type :string)
   $users-linked-primary-user])

(def $magic-code-attrs
  [(make-attr "$magicCodes" "id"
              :unique? true
              :index? true)
   (make-attr "$magicCodes" "codeHash"
              :unique? false
              :index? true
              :checked-data-type :string)
   (make-attr "$magicCodes" "email"
              :unique? false
              :index? true
              :checked-data-type :string)])

(def $user-refresh-token-attrs
  [(make-attr "$userRefreshTokens" "id"
              :unique? true
              :index? true)
   (make-attr "$userRefreshTokens" "hashedToken"
              :unique? true
              :index? true
              :checked-data-type :string)
   (make-attr "$userRefreshTokens" "$user"
              :reverse-identity (get-ident-spec "$users" "$userRefreshTokens")
              :index? true
              :value-type :ref
              :on-delete :cascade)])

(def $oauth-provider-attrs
  [(make-attr "$oauthProviders" "id"
              :unique? true
              :index? true)
   (make-attr "$oauthProviders" "name"
              :unique? true
              :index? true
              :checked-data-type :string)])

(def $user-oauth-link-attrs
  [(make-attr "$oauthUserLinks" "id"
              :unique? true
              :index? true)
   (make-attr "$oauthUserLinks" "sub"
              :unique? false
              :index? true
              :checked-data-type :string)
   (make-attr "$oauthUserLinks" "$user"
              :reverse-identity (get-ident-spec "$users" "$oauthUserLinks")
              :index? true
              :value-type :ref
              :on-delete :cascade)
   (make-attr "$oauthUserLinks" "$oauthProvider"
              :reverse-identity (get-ident-spec "$oauthProviders" "$oauthUserLinks")
              :index? true
              :on-delete :cascade)
   ;; Trick to get a unique key on multiple attrs We have to manually
   ;; set it, but it would be nice if instant provided some sort of
   ;; computed column to do this automatically
   (make-attr "$oauthUserLinks" "sub+$oauthProvider"
              :unique? true
              :index? true
              :checked-data-type :string)])

(def $oauth-client-attrs
  [(make-attr "$oauthClients" "id"
              :unique? true
              :index? true)
   (make-attr "$oauthClients" "$oauthProvider"
              :reverse-identity (get-ident-spec "$oauthProviders" "$oauthClients")
              :value-type :ref
              :on-delete :cascade)
   (make-attr "$oauthClients" "name"
              :unique? true
              :index? true
              :checked-data-type :string)
   (make-attr "$oauthClients" "clientId"
              :index? true)
   (make-attr "$oauthClients" "encryptedClientSecret"
              :checked-data-type :string)
   (make-attr "$oauthClients" "discoveryEndpoint"
              :checked-data-type :string)
   (make-attr "$oauthClients" "meta")
   (make-attr "$oauthClients" "redirectTo"
              :checked-data-type :string)])

(def $oauth-code-attrs
  [(make-attr "$oauthCodes" "id"
              :unique? true
              :index? true)
   (make-attr "$oauthCodes" "codeHash"
              :unique? true
              :index? true
              :checked-data-type :string)
   (make-attr "$oauthCodes" "codeChallengeMethod"
              :checked-data-type :string)
   (make-attr "$oauthCodes" "codeChallenge"
              :checked-data-type :string)
   (make-attr "$oauthCodes" "userInfo")
   (make-attr "$oauthCodes" "$oauthClient"
              :reverse-identity (get-ident-spec "$oauthClients" "$oauthCodes")
              :value-type :ref
              :on-delete :cascade)])

(def $oauth-redirect-attrs
  [(make-attr "$oauthRedirects" "id"
              :unique? true
              :index? true)
   (make-attr "$oauthRedirects" "stateHash"
              :unique? true
              :index? true
              :checked-data-type :string)
   (make-attr "$oauthRedirects" "cookieHash"
              :unique? false
              :index? false
              :checked-data-type :string)
   (make-attr "$oauthRedirects" "redirectUrl"
              :unique? false
              :index? false
              :checked-data-type :string)
   (make-attr "$oauthRedirects" "redirectTo"
              :unique? false
              :index? false
              :checked-data-type :string)
   (make-attr "$oauthRedirects" "$oauthClient"
              :reverse-identity (get-ident-spec "$oauthClients" "$oauthRedirects")
              :value-type :ref
              :on-delete :cascade)
   (make-attr "$oauthRedirects" "codeChallengeMethod"
              :checked-data-type :string)
   (make-attr "$oauthRedirects" "codeChallenge"
              :checked-data-type :string)])

(def $files-attrs
  [(make-attr "$files" "id"
              :unique? true
              :index? true)
   (make-attr "$files" "path"
              :unique? true
              :index? true
              :checked-data-type :string
              :required? true)
   (make-attr "$files" "size"
              :unique? false
              :index? true
              :checked-data-type :number
              :required? true)
   (make-attr "$files" "content-type"
              :unique? false
              :index? true
              :checked-data-type :string)
   (make-attr "$files" "content-disposition"
              :unique? false
              :index? true
              :checked-data-type :string)
   (make-attr "$files" "location-id"
              :unique? true
              :index? true
              :checked-data-type :string
              :required? true)
   (make-attr "$files" "key-version"
              :unique? false
              :index? false
              :checked-data-type :number)
   (make-attr "$files" "url"
              :unique? false
              :index? false
              :checked-data-type :string)])

(def $streams-attrs
  [(make-attr "$streams" "id"
              :unique? true
              :index? true)
   (make-attr "$streams" "clientId"
              :unique? true
              :index? true
              :checked-data-type :string
              :required? true)
   (make-attr "$streams" "machineId"
              :checked-data-type :string)
   (make-attr "$streams" "$files"
              :value-type :ref
              :reverse-identity (get-ident-spec "$files" "$stream")
              :cardinality :many
              ;; XXX: Add support for restrict
              ;; :on-delete :restrict
              :on-delete-reverse :cascade)
   (make-attr "$streams" "done"
              :checked-data-type :boolean)
   (make-attr "$streams" "size"
              :checked-data-type :number)
   (make-attr "$streams" "hashedReconnectToken"
              :checked-data-type :string)
   (make-attr "$streams" "abortReason"
              :checked-data-type :string)])

(def all-attrs (concat $users-attrs
                       $magic-code-attrs
                       $user-refresh-token-attrs
                       $oauth-provider-attrs
                       $user-oauth-link-attrs
                       $oauth-client-attrs
                       $oauth-code-attrs
                       $oauth-redirect-attrs
                       $files-attrs
                       $streams-attrs))

(defn- ^:private reserved-ident-names
  "Want to add a new system catalog attribute?

   1. Find a good, unique ident name for it (etype + label). i.e: ['$users' 'fullName']
   2. Head on over to instant-config, and update the flag to include your new ident name.

   This will reserve the ident name, so users can't create that attribute.

   Once your PR is ready, deploy the change, create your system catalog attr, then
   remove the ident name from the flag."
  []
  (flags/flag :reserved-system-catalog-ident-names #{}))

(def ^:private existing-ident-names
  (->> all-attrs
       (mapcat (fn [{:keys [forward-identity reverse-identity]}]
                 (cond-> []
                   forward-identity (conj (vec (rest forward-identity)))
                   reverse-identity (conj (vec (rest reverse-identity))))))
       set))

(defn reserved-ident-name? [[etype label]]
  (or (contains? (reserved-ident-names) [etype label])
      (contains? existing-ident-names [etype label])))

(def editable-etypes
  "We let users create new attributes on these etypes."
  #{"$users" "$files"})

(def ^:private  editable-triple-ident-names
  #{["$users" "id"]
    ["$files" "id"]
    ["$files" "path"]})

(defn editable-triple-ident-name?
  "There are some system catalog attributes that we let users edit. 
  
  $users.id and $files.id 
    In order to enable any edits for $users and $files, the `id` triple 
    has to be editable. This is because we always do an insert for the 
    id triple when updating entities. 

  $files.path 
    There may be good reason for a user to change the $files.path for a file."
  [[etype label]]
  (contains? editable-triple-ident-names [etype label]))

