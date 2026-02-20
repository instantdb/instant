(ns instant.mma-example
  "Helpers for the ai sdk example repo"
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [compojure.core :as compojure :refer [POST defroutes]]
   [instant.jdbc.aurora :as aurora]
   [instant.system-catalog-ops :refer [query-op]]
   [instant.util.exception :as ex]
   [instant.util.json :as json]
   [instant.util.string :as string-util]
   [instant.util.tracer :as tracer]
   [instant.util.floats :as floats-util]
   [ring.util.http-response :as response])
  (:import
   (com.github.luben.zstd Zstd)
   (software.amazon.awssdk.core SdkBytes)
   (software.amazon.awssdk.services.bedrockruntime BedrockRuntimeClient)
   (software.amazon.awssdk.services.bedrockruntime.model InvokeModelRequest)))

(def client* (delay (.build (BedrockRuntimeClient/builder))))

(defn client ^BedrockRuntimeClient []
  @client*)

(defn get-embedding-for-prompt ^floats [prompt]
  (tracer/with-span! {:name "mma-example/get-embedding-for-prompt"}
    (let [truncated-prompt (if (> (count prompt) 2000)
                             (subs prompt 0 2000)
                             prompt)
          body (SdkBytes/fromUtf8String (json/->json {:inputText truncated-prompt}))
          ^InvokeModelRequest req (.. (InvokeModelRequest/builder)
                                      (modelId "amazon.titan-embed-text-v2:0")
                                      (contentType "application/json")
                                      (body body)
                                      (build))
          res (-> (.invokeModel (client) req)
                  (.body)
                  (.asUtf8String)
                  (json/<-json))]
      (tracer/add-data! {:attributes {:token-count (get res "inputTextTokenCount")
                                      :prompt truncated-prompt}})
      (-> res
          (get "embedding")
          (float-array)))))

(def embeddings (delay (let [bytes (with-open [is (io/input-stream (io/resource "mma/embeddings.edn.zstd"))]
                                     (.readAllBytes is))
                             edn-bytes (Zstd/decompress ^bytes bytes (Zstd/decompressedSize ^bytes bytes))
                             data (edn/read-string {:readers {'floats float-array}}
                                                   (String. edn-bytes "UTF-8"))]
                         (mapv (fn [x]
                                 (update x :embedding floats-util/normalize))
                               data))))

(defn best-matching-prompts [prompt]
  (let [embedding (floats-util/normalize (get-embedding-for-prompt prompt))]
    (->> @embeddings
         (map (fn [x]
                (assoc x :score (floats-util/dot-product (:embedding x) embedding))))
         (sort-by :score >)
         (take 5)
         (mapv (fn [x]
                 (dissoc x :embedding))))))

(def mma-app-id #uuid "8a3ad1ba-e652-46dd-805c-d2d0e82ff802")

(defn code-for-prompt [prompt]
  (let [matches (best-matching-prompts prompt)
        match (if-let [over-threshold (seq (filter #(> 0.7 (:score %))
                                                   matches))]
                (rand-nth over-threshold)
                (first matches))
        original-prompt (query-op (aurora/conn-pool :read)
                                  {:app-id mma-app-id
                                   :etype "sessions"}
                                  (fn [{:keys [get-entity]}]
                                    (:initialPrompt (get-entity (:session-id match)))))
        code (query-op (aurora/conn-pool :read)
                       {:app-id mma-app-id
                        :etype "builds"}
                       (fn [{:keys [get-entity]}]
                         (:code (get-entity (:build-id match)))))]
    (tool/def-locals)
    {:code code
     :prompt original-prompt}))

(defn mma-post [req]
  (let [prompt (ex/get-param! req [:body :prompt] string-util/coerce-non-blank-str)]
    (response/ok (select-keys (code-for-prompt prompt)
                              [:code :prompt]))))

(defroutes routes
  (POST "/examples/mma" [] mma-post))
