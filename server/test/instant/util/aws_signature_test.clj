(ns instant.util.aws-signature-test
  "We test against the examples from AWS docs: 

  https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html#example-signature-calculations"
  (:require [instant.util.aws-signature :as aws-sig]
            [clojure.test :as test :refer [deftest is testing]]
            [clojure.string :as str]
            [instant.util.crypt :as crypt-util]
            [instant.storage.s3 :as storage-s3])
  (:import (java.time Instant Duration)))

(def example-aws-access-key "AKIAIOSFODNN7EXAMPLE")
(def example-aws-secret-key "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY")
(def example-signing-instant (Instant/parse "2013-05-24T00:00:00Z"))
(def example-bucket-name "examplebucket")
(def example-region "us-east-1")

(deftest aws-get-object-ex
  (let [sig-request (aws-sig/create-sig-request
                     {:access-key example-aws-access-key
                      :secret-key example-aws-secret-key

                      :method :get
                      :region example-region
                      :service "s3"
                      :path "/test.txt"

                      :signing-instant example-signing-instant

                      :headers {"host" (aws-sig/s3-host example-region
                                                        example-bucket-name)
                                "range" "bytes=0-9"
                                "x-amz-date" (aws-sig/instant->amz-date
                                              example-signing-instant)
                                "x-amz-content-sha256" aws-sig/empty-sha256}})]
    (testing "canonical-request-str"
      (is (= ["GET"
              "/test.txt"
              ""
              "host:examplebucket.s3.amazonaws.com"
              "range:bytes=0-9"
              "x-amz-content-sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
              "x-amz-date:20130524T000000Z"
              ""
              "host;range;x-amz-content-sha256;x-amz-date"
              "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"]

             (str/split (aws-sig/->canonical-request-str
                         sig-request)
                        #"\n"))))

    (testing "string-to-sign"
      (is (= ["AWS4-HMAC-SHA256"
              "20130524T000000Z"
              "20130524/us-east-1/s3/aws4_request"
              "7344ae5b7ee6c3e7e6b0fe0640412a37625d1fbfff95c48bbb2dc43964946972"]

             (str/split  (aws-sig/->string-to-sign sig-request)
                         #"\n"))))

    (testing "signing-key"
      (is (= "dbb893acc010964918f1fd433add87c70e8b0db6be30c1fbeafefa5ec6ba8378"
             (crypt-util/bytes->hex-string (aws-sig/->signing-key-bytes sig-request)))))

    (testing "signature"
      (is (= "f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41"
             (aws-sig/->signature sig-request))))))

(deftest aws-put-object-ex
  (let [sig-request (aws-sig/create-sig-request
                     {:access-key example-aws-access-key
                      :secret-key example-aws-secret-key

                      :method :put
                      :region example-region
                      :service "s3"
                      :path "/test$file.text"

                      :signing-instant example-signing-instant

                      :headers {"host" (aws-sig/s3-host example-region
                                                        example-bucket-name)
                                "date" "Fri, 24 May 2013 00:00:00 GMT"
                                "x-amz-date" (aws-sig/instant->amz-date
                                              example-signing-instant)
                                "x-amz-storage-class" "REDUCED_REDUNDANCY"
                                "x-amz-content-sha256" "44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072"}})]

    (testing "canonical-request-str"
      (is (= ["PUT"
              "/test%24file.text"
              ""
              "date:Fri, 24 May 2013 00:00:00 GMT"
              "host:examplebucket.s3.amazonaws.com"
              "x-amz-content-sha256:44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072"
              "x-amz-date:20130524T000000Z"
              "x-amz-storage-class:REDUCED_REDUNDANCY"
              ""
              "date;host;x-amz-content-sha256;x-amz-date;x-amz-storage-class"
              "44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072"]
             (str/split (aws-sig/->canonical-request-str
                         sig-request)
                        #"\n"))))

    (testing "string-to-sign"
      (is (= ["AWS4-HMAC-SHA256"
              "20130524T000000Z"
              "20130524/us-east-1/s3/aws4_request"
              "9e0e90d9c76de8fa5b200d8c849cd5b8dc7a3be3951ddb7f6a76b4158342019d"]
             (str/split  (aws-sig/->string-to-sign sig-request)
                         #"\n"))))

    (testing "signing-key"
      (is (= "dbb893acc010964918f1fd433add87c70e8b0db6be30c1fbeafefa5ec6ba8378"
             (crypt-util/bytes->hex-string (aws-sig/->signing-key-bytes sig-request)))))

    (testing "signature"
      (is (= "98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd"
             (aws-sig/->signature sig-request))))))

(deftest aws-get-bucket-lifecycle-ex
  (let [sig-request (aws-sig/create-sig-request
                     {:access-key example-aws-access-key
                      :secret-key example-aws-secret-key

                      :method :get
                      :region example-region
                      :service "s3"
                      :path "/"
                      :query {"lifecycle" ""}

                      :signing-instant example-signing-instant

                      :headers {"host" (aws-sig/s3-host example-region
                                                        example-bucket-name)
                                "x-amz-date" (aws-sig/instant->amz-date
                                              example-signing-instant)
                                "x-amz-content-sha256" aws-sig/empty-sha256}})]
    (testing "canonical-request-str"
      (is (= ["GET"
              "/"
              "lifecycle="
              "host:examplebucket.s3.amazonaws.com"
              "x-amz-content-sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
              "x-amz-date:20130524T000000Z"
              ""
              "host;x-amz-content-sha256;x-amz-date"
              "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"]
             (str/split (aws-sig/->canonical-request-str sig-request)
                        #"\n"))))

    (testing "string-to-sign"
      (is (= ["AWS4-HMAC-SHA256"
              "20130524T000000Z"
              "20130524/us-east-1/s3/aws4_request"
              "9766c798316ff2757b517bc739a67f6213b4ab36dd5da2f94eaebf79c77395ca"]
             (str/split  (aws-sig/->string-to-sign sig-request)
                         #"\n"))))

    (testing "signing-key"
      (is (= "dbb893acc010964918f1fd433add87c70e8b0db6be30c1fbeafefa5ec6ba8378"
             (crypt-util/bytes->hex-string (aws-sig/->signing-key-bytes sig-request)))))

    (testing "signature"
      (is (= "fea454ca298b7da1c68078a5d1bdbfbbe0d65c699e0f91ac7a200a0136783543"
             (aws-sig/->signature sig-request))))))

(deftest aws-get-bucket-list-objects-ex
  (let [sig-request (aws-sig/create-sig-request
                     {:access-key example-aws-access-key
                      :secret-key example-aws-secret-key

                      :method :get
                      :region example-region
                      :service "s3"
                      :path "/"
                      :query {"max-keys" 2
                              "prefix" "J"}

                      :signing-instant example-signing-instant

                      :headers {"host" (aws-sig/s3-host example-region
                                                        example-bucket-name)
                                "x-amz-date" (aws-sig/instant->amz-date
                                              example-signing-instant)
                                "x-amz-content-sha256" aws-sig/empty-sha256}})]
    (testing "canonical-request-str"
      (is (= ["GET"
              "/"
              "max-keys=2&prefix=J"
              "host:examplebucket.s3.amazonaws.com"
              "x-amz-content-sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
              "x-amz-date:20130524T000000Z"
              ""
              "host;x-amz-content-sha256;x-amz-date"
              "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"]
             (str/split (aws-sig/->canonical-request-str sig-request)
                        #"\n"))))

    (testing "string-to-sign"
      (is (= ["AWS4-HMAC-SHA256"
              "20130524T000000Z"
              "20130524/us-east-1/s3/aws4_request"
              "df57d21db20da04d7fa30298dd4488ba3a2b47ca3a489c74750e0f1e7df1b9b7"]
             (str/split  (aws-sig/->string-to-sign sig-request)
                         #"\n"))))

    (testing "signing-key"
      (is (= "dbb893acc010964918f1fd433add87c70e8b0db6be30c1fbeafefa5ec6ba8378"
             (crypt-util/bytes->hex-string (aws-sig/->signing-key-bytes sig-request)))))

    (testing "signature"
      (is (= "34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7"
             (aws-sig/->signature sig-request))))))

(def example-app-id #uuid "998acba8-1d01-44f2-bea3-d683ccc493c9")
(def example-location-id "590548c1-c4ec-4bf9-9df3-2ef603b190d2")

(defn- url->pretty [url]
  (let [[base query-params] (str/split url #"\?")
        query (str/split query-params #"&")]
    (into [base] query)))

(deftest s3-presign-urls
  (let [get-req (aws-sig/presign-s3-url
                 {:access-key example-aws-access-key
                  :secret-key example-aws-access-key
                  :region example-region
                  :method :get
                  :bucket example-bucket-name
                  :signing-instant example-signing-instant
                  :expires-duration (Duration/ofSeconds 400)
                  :path (storage-s3/->object-key example-app-id example-location-id)})
        put-req (aws-sig/presign-s3-url
                 {:access-key example-aws-access-key
                  :secret-key example-aws-access-key
                  :region example-region
                  :method :put
                  :bucket example-bucket-name
                  :signing-instant example-signing-instant
                  :expires-duration (Duration/ofSeconds 400)
                  :path (storage-s3/->object-key example-app-id example-location-id)})]
    (is (= ["https://examplebucket.s3.amazonaws.com/998acba8-1d01-44f2-bea3-d683ccc493c9/1/590548c1-c4ec-4bf9-9df3-2ef603b190d2"
            "X-Amz-Algorithm=AWS4-HMAC-SHA256"
            "X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request"
            "X-Amz-Date=20130524T000000Z"
            "X-Amz-Expires=400"
            "X-Amz-Signature=3cc677e69965c690abb6c317055b8e3db209470d501515fa9ead69d4cd077757"
            "X-Amz-SignedHeaders=host"]
           (url->pretty get-req)))
    (is (= ["https://examplebucket.s3.amazonaws.com/998acba8-1d01-44f2-bea3-d683ccc493c9/1/590548c1-c4ec-4bf9-9df3-2ef603b190d2"
            "X-Amz-Algorithm=AWS4-HMAC-SHA256"
            "X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request"
            "X-Amz-Date=20130524T000000Z"
            "X-Amz-Expires=400"
            "X-Amz-Signature=c7c9312ca2ee0e59ed3c1a16f24af8e74cf8ef36d70a45dffc6efc8698ecaaaa"
            "X-Amz-SignedHeaders=host"]
           (url->pretty put-req)))))

(comment
  (test/run-tests *ns*))
