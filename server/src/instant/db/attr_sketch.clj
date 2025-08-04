(ns instant.db.attr-sketch
  (:require
   [clojure.pprint]
   [instant.db.model.triple :as triple])
  (:import
   (java.nio ByteBuffer)
   (net.openhft.hashing LongHashFunction)))

(set! *warn-on-reflection* true)

(defrecord Sketch [width
                   depth
                   bins
                   total
                   total-not-binned])

;; Update printer so that it doesn't print a ton numbers for the bins
(defmethod clojure.pprint/simple-dispatch Sketch [x]
  (let [bin-display (symbol (format "<bins %d>" (count (:bins x))))]
    (#'clojure.pprint/pprint-map (into {} (assoc x :bins bin-display)))))

(def ln2 (Math/log 2))

(defn make-sketch
  ([] (make-sketch {}))
  ([{:keys [confidence error-rate]
     :or {confidence 0.998
          error-rate 0.001}}]
   (let [width (int (Math/ceil (/ 2 error-rate)))
         depth (int (Math/ceil (/ (* -1 (Math/log (- 1 confidence)))
                                  ln2)))]
     (map->Sketch {:width width
                   :depth depth
                   :bins (vec (repeat (* width depth) 0))
                   :total 0
                   :total-not-binned 0}))))

(defn data-type-for-hash [checked-data-type x]
  (case checked-data-type
    :number (condp instance? x
              java.lang.Long [:long x]
              java.lang.Integer [:integer x]
              java.lang.Double [:double x])
    :string [:string x]
    :boolean [:boolean x]
    :date [:long (.toEpochMilli (triple/parse-date-value x))]

    (condp instance? x
      java.lang.Long [:long x]
      java.lang.Integer [:integer x]
      java.lang.String [:string x]
      java.lang.Boolean [:boolean x]
      ;; Use string as the universal format for uuids for the purpose of
      ;; the sketch. We could use bytes, but this will still work if the
      ;; uuid gets passed to us as a string somehow
      java.util.UUID [:string (str x)]
      nil)))

(defn hash-val [^Long seed ^Long hash-idx data-type val]
  (let [xx (LongHashFunction/xx3 (+ seed hash-idx))]
    (case data-type
      :long (.hashLong xx val)
      :integer (.hashInt xx val)
      :double (.hashBytes xx (.. (ByteBuffer/allocate 8)
                                 (putDouble val)
                                 (array)))
      :string (.hashChars xx ^String val)
      :boolean (.hashBoolean xx val))))

(defn add
  ([^Sketch sketch checked-data-type v]
   (add sketch checked-data-type v 1))
  ([^Sketch sketch checked-data-type v_ n]
   (if-let [[data-type v] (data-type-for-hash checked-data-type v_)]
     ;; Only track counts for the items that you can query for
     (let [seed (hash-val 0 -1 data-type v)
           bins (persistent!
                  (reduce (fn [bins i]
                            (let [hash (hash-val seed i data-type v)
                                  bin-idx (int (+ (Long/remainderUnsigned hash
                                                                          (:width sketch))
                                                  (* i (:width sketch))))]
                              (assoc! bins bin-idx (+ (get bins bin-idx)
                                                      n))))
                          (transient (:bins sketch))
                          (range (:depth sketch))))]
       (-> sketch
           (update :total + n)
           (assoc :bins bins)))
     ;; Track totals even if you can't query for the item
     (-> sketch
         (update :total + n)
         (update :total-not-binned + n)))))

(defn add-batch
  "Expects items to be a map of {:value, :checked-data-type} => n, will add all
   items to the sketch in a single batch."
  ([^Sketch sketch items]
   (let [{:keys [bins item-count not-binned-count]}
         (persistent!
           (reduce-kv (fn [acc {:keys [value checked-data-type]} n]
                        (if-let [[data-type v] (data-type-for-hash checked-data-type value)]
                          (let [seed (hash-val 0 -1 data-type v)
                                bins (reduce (fn [bins i]
                                               (let [hash (hash-val seed i data-type v)
                                                     bin-idx (int (+ (Long/remainderUnsigned hash
                                                                                             (:width sketch))
                                                                     (* i (:width sketch))))]
                                                 (assoc! bins bin-idx (+ n (get bins bin-idx)))))
                                             (:bins acc)
                                             (range (:depth sketch)))]
                            (-> acc
                                (assoc! :bins bins)
                                (assoc! :item-count (+ (:item-count acc) n))))
                          (-> acc
                              (assoc! :item-count (+ (:item-count acc) n))
                              (assoc! :not-binned-count (+ (:not-binned-count acc) n)))))
                      (transient {:bins (transient (:bins sketch))
                                  :item-count 0
                                  :not-binned-count 0})
                      items))]
     (-> sketch
         (update :total + item-count)
         (update :total-not-binned + not-binned-count)
         (assoc :bins (persistent! bins))))))

(defn check [^Sketch sketch checked-data-type val_]
  (let [[data-type val] (data-type-for-hash checked-data-type val_)
        _ (assert data-type (format "Unknown data for sketch %s" val))
        seed (hash-val 0 -1 data-type val)]
    (reduce (fn [m i]
              (let [hash (hash-val seed i data-type val)
                    bin-idx (int (+ (Long/remainderUnsigned hash
                                                            (:width sketch))
                                    (* i (:width sketch))))
                    bin-val (nth (:bins sketch) bin-idx)]
                (if m
                  (min bin-val m)
                  bin-val)))
            nil
            (range (:depth sketch)))))
