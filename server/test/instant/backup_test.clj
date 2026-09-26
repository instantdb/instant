(ns instant.backup-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [instant.backup :as backup])
  (:import
   (java.io ByteArrayOutputStream IOException InputStream)
   (java.nio ByteBuffer)
   (okio Buffer Okio Pipe)
   (org.reactivestreams Subscriber Subscription)
   (software.amazon.awssdk.core.async AsyncRequestBody)))

(deftest filling-input-stream-preserves-bytes
  (doseq [size [0 1 8191 8192 8193 16383 16384 16385 32775]]
    (testing (str size " bytes")
      (let [data (byte-array (map unchecked-byte (range size)))
            source (doto (Buffer.) (.write data))
            output (ByteArrayOutputStream.)]
        (with-open [input (backup/filling-input-stream (.inputStream source))]
          (let [buffer (byte-array 16384)
                reads (loop [reads []]
                        (let [n (.read input buffer)]
                          (if (neg? n)
                            reads
                            (do
                              (.write output buffer 0 n)
                              (recur (conj reads n))))))]
            (is (= (seq data) (seq (.toByteArray output))))
            (is (= (vec (concat (repeat (quot size 16384) 16384)
                               (when (pos? (mod size 16384))
                                 [(mod size 16384)])))
                   reads))
            (is (= 0 (.read input buffer 0 0)))
            (is (= -1 (.read input buffer)))))))))

(deftest filling-input-stream-read-overloads
  (let [source (doto (Buffer.) (.write (byte-array (range 17))))]
    (with-open [input (backup/filling-input-stream (.inputStream source))]
      (let [buffer (byte-array 20)]
        (is (= 0 (.read input)))
        (is (= 16 (.read input buffer 2 16)))
        (is (= [0 0] (subvec (vec buffer) 0 2)))
        (is (= (vec (range 1 17)) (subvec (vec buffer) 2 18)))
        (is (= [0 0] (subvec (vec buffer) 18)))
        (is (= -1 (.read input buffer 2 16)))
        (is (= 0 (.read input (byte-array 0))))))))

(deftest filling-input-stream-propagates-errors-and-close
  (let [failure (IOException. "read failed")
        closed? (atom false)
        source (proxy [InputStream] []
                 (read
                   ([] (throw failure))
                   ([_buffer] (throw failure))
                   ([_buffer _offset _length] (throw failure)))
                 (close [] (reset! closed? true)))]
    (with-open [input (backup/filling-input-stream source)]
      (is (identical? failure
                      (try
                        (.read input (byte-array 16))
                        (catch IOException t t)))))
    (is @closed?)))

(deftest filling-input-stream-propagates-pipe-cancellation
  (let [pipe (Pipe. 262144)]
    (with-open [input (backup/filling-input-stream (.inputStream (Okio/buffer (.source pipe))))]
      (.cancel pipe)
      (is (thrown? IOException (.read input (byte-array 16384)))))))

(deftest filling-input-stream-halves-sdk-payload-buffers
  (let [data (byte-array (map unchecked-byte (range 65536)))
        read-sdk (fn [wrap-input]
                   (let [source (doto (Buffer.) (.write data))
                         output (ByteArrayOutputStream.)
                         capacities (atom [])
                         done (promise)]
                     (with-open [input (wrap-input (.inputStream source))]
                       (.subscribe (AsyncRequestBody/fromInputStream input nil)
                                   (reify Subscriber
                                     (onSubscribe [_ subscription]
                                       (.request ^Subscription subscription Long/MAX_VALUE))
                                     (onNext [_ buffer]
                                       (let [^ByteBuffer buffer buffer]
                                         (swap! capacities conj (.capacity buffer))
                                         (.write output (.array buffer)
                                                 (+ (.arrayOffset buffer) (.position buffer))
                                                 (.remaining buffer))))
                                     (onError [_ t] (deliver done t))
                                     (onComplete [_] (deliver done true))))
                       (is (= true (deref done 5000 ::timeout))))
                     (is (= (seq data) (seq (.toByteArray output))))
                     @capacities))
        original (read-sdk identity)
        filled (read-sdk backup/filling-input-stream)]
    (is (= (vec (repeat 8 16384)) original))
    (is (= (vec (repeat 4 16384)) filled))))
