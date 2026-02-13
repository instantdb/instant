(ns instant.util.cloudfront-test
  (:require
   [clojure.test :as test :refer [deftest is]]
   [instant.util.crypt :as crypt-util]
   [instant.util.cloudfront :as cloudfront])
  (:import (java.time Instant Duration)))

(deftest signed-urls-for-same-date-are-the-same
  (let [key (crypt-util/generate-cloudfront-key)
        signing-instant (Instant/now)
        duration (Duration/ofDays 2)
        key-id (crypt-util/random-hex 8)
        url "https://example.com"]
    (is (= (cloudfront/sign-cloudfront-url {:url url
                                            :key-id key-id
                                            :private-key (.getPrivate key)
                                            :signing-instant signing-instant
                                            :duration duration})
           (cloudfront/sign-cloudfront-url {:url url
                                            :key-id key-id
                                            :private-key (.getPrivate key)
                                            :signing-instant signing-instant
                                            :duration duration})))))

(def test-private-key (-> "308204bd020100300d06092a864886f70d0101010500048204a7308204a30201000282010100e4bbb11478390f43f5453458fc27abd39303ecba2f0054d91442fbe87774ee2727149ef026324575222f8377974518095e543228d792c1ceefd79c69405e22ee4dab418f7e068f1141b629d79615792f668a1ca7c175487aab929ce5c09ec98e4515b4dda861a9bde2c524f6a52914dd8e6c23f65837efa030a3b8b0412f8d2ada501eb869a3340552a484d8f43509b6ab6b2c2552b506c2ef9108f369e88f240ebd318256b58795a18848f7a216b511aa20add6ed7f00a8e1fdae4ea249f59904490f884ed56fa144824b320c5f19053a9aca90902b91e6e61ca4587254aa7f01232d853d5dc2d4ca0f71cffc6d03c8b9b4690dc0ce392e37ca7b0c3f92795d0203010001028201005117e6212eba741a10e4173a1133f36c506c0ccab98d3187c0f23aa3616eb85c73339161ecf8d7bd3e807fe8af5dd4b6c595ae2ee2b6ea3576bd077c1d5102ab6027fe576443e9072237f63fb3bb2b3acdecdb59f271a55fb0628b73bd45ce89bd1e84002e096a07a35567d4761bc984ff5081b37df55ee4793a226982c2dc161079d64d32870f22011adbdac31e46a0f9b6ee74e96f74e867ede6fb9cef44e5e9d086c8bcda00bb393a2c2324ccd08225d6a717a65a885604d56b580a712c1904f4c74c4ea95f22dd725870ce625c61cd0668498a7f1f3a24ffe0c36c40af3c184830ec46b764e69d6e0e69d0c306af6b12087da390509a18c63cd66dcee4d502818100ff4b88d874202e8b37632101d5516784aa71934a5ad8c1f9db9ba9bbcfe9db6f2a838b840f707db8b1d50c1e105f30dad1344ae6b2ef53000e8c321c73f2bf94db15e392d2aa539ae83aa8d1ec885a56316b7797f39c9c5aae6d98a025e2ba65012cb78425dc637f62db07df353cd412f7615b6c0990cc77d59ac1fb72a43eab02818100e55d617edc4a01f8fc4bf7b4457ecfd9bf38aef84c8754065128c8417c47f35800ca26eeb12feed29cf0cd2e2d11b48cce0d0b4f5cf22ba1b20dea2ea85c73160da84f91554765012a256fa2f5ecd0f316b6664edc9be5add76e7631763c10f2bfa05502fad72c35ebe57e9f5aa9feb29982613a52d5adbc3dab6715dc92881702818048b7501c2f3f776269fd4f4a816335742144466ad8638324d2fb8ca6153b8c2826d8df25576c7832e25c479e4c958089e32adce6c732c9d66b4e5d7ba33f1278a8ca9c4e96b8b3259d5e0ff5f344874ea3b6f392916e1b4eecfe048a21206a6d189f8f0a11eaab607e5cdaea25f4d4872e7549a0053d7c2fe9e4b1ba1856560f02818100d5c7bfc39a5770973db120e36992d4f04386f5ae80c5f1cf217e3d88abe9f42a2632452f5cff2c3e2a01577c9e8d4e179f4611309b952c8dbd83b2ae6246290e791453754663110590deebba9c356a5be8e3816027c736c05d779bba66557e06840d50af4255a3e36e47ad49a21ba84597472a904dfcd3be0c4ce1fc426661690281802f89809654e757a2d866c39b73ef81ed4fb1a9cae7aa811d65079aef59da25bedf08983ab0e1729ac747ada1f46b63e0d7b9a6aa2e152e598909622033d94f742dca21dd925522c618430d6ff0f73f884dd2936ac296497a7f2266442797c9fbab5f378179c2b9505811e967e386a1d9d83d5d72ae8c05f40f4ec99a971ea1be"
                          crypt-util/hex-string->bytes
                          crypt-util/cloudfront-key-from-bytes))

(def test-key-id "7d1b3a9cc3650299")


(deftest smoke-test
  (is (= "https://example.com?response-cache-control=public%2C%20max-age%3D86400%2C%20immutable&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9leGFtcGxlLmNvbT9yZXNwb25zZS1jYWNoZS1jb250cm9sPXB1YmxpYyUyQyUyMG1heC1hZ2UlM0Q4NjQwMCUyQyUyMGltbXV0YWJsZSIsIkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTc3MTA5Mzc2MX19fV19&Signature=YYsLp0GXBFYgk7mB0oUYEBPo5mQ1gWoYbCHVEf9H1PXj4-PCEaEwLi8ctN700CHoDky-lvJAY3EQozwC2Cfr-DwT-tuVFy6fS4ddk8Z4eNR1s8DmeYuAzmlzqj0wtTmMve~pvE5Xdjq8hNRCNtQxOJrm4ddhGxA4mcgUGP7q2gYJW~SvhHqCr~hVUgOiaRnN7PRPrYvgG8UFaxTEKNPc439juVdshXLe9Uafh5uZdk7UxlhG7p0NHpCULwX0JgOY3V-75Ki3dq-NLxNhbU0HdYipzVt1nxoyB96M5GXTSyovidtHL6Yr4hH10IAzI4JohO~zeO6i1iT4zqyqao1i2Q&Key-Pair-Id=7d1b3a9cc3650299"
         (cloudfront/sign-cloudfront-url {:url "https://example.com"
                                          :key-id test-key-id
                                          :private-key test-private-key
                                          :signing-instant (Instant/ofEpochSecond 1771007361)
                                          :duration (Duration/ofDays 1)}))))
