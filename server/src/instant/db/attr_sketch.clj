(ns instant.db.attr-sketch
  (:require
   [clojure.pprint]
   [honey.sql :as hsql]
   [instant.config :as config]
   [instant.db.model.triple :as triple]
   [instant.jdbc.sql :as sql])
  (:import
   (java.nio ByteBuffer)
   (net.openhft.hashing LongHashFunction)))

(set! *warn-on-reflection* true)

(defrecord Sketch [width
                   depth
                   bins
                   total
                   total-not-binned])

;; Update printer so that it doesn't print a ton of zeroes
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
         (update sketch :total + n)
         (update sketch :total-not-binned + n)))))

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

(defn check-mean-min [^Sketch sketch checked-data-type val_]
  (let [[data-type val] (data-type-for-hash checked-data-type val_)
        _ (assert data-type (format "Unknown data for sketch %s" val))
        seed (hash-val 0 -1 data-type val)
        total (reduce (fn [total i]
                        (let [hash (hash-val seed i data-type val)
                              bin-idx (int (+ (Long/remainderUnsigned hash
                                                                      (:width sketch))
                                              (* i (:width sketch))))
                              bin-val (nth (:bins sketch) bin-idx)
                              diff (- (:total sketch) bin-val)]
                          (+ total (- bin-val
                                      (quot diff
                                            (dec (:width sketch)))))))
                      0
                      (range (:depth sketch)))]
    (quot total (:depth sketch))))

(defn check-mean [^Sketch sketch checked-data-type val_]
  (let [[data-type val] (data-type-for-hash checked-data-type val_)
        _ (assert data-type (format "Unknown data for sketch %s" val))
        seed (hash-val 0 -1 data-type val)
        total (reduce (fn [total i]
                        (let [hash (hash-val seed i data-type val)
                              bin-idx (int (+ (Long/remainderUnsigned hash
                                                                      (:width sketch))
                                              (* i (:width sketch))))
                              bin-val (nth (:bins sketch) bin-idx)]
                          (+ total bin-val)))
                      0
                      (range (:depth sketch)))]
    (quot total (:depth sketch))))

;; XXX: Testing ints
;; Deciding not to use ints for these reasons
;;  1. Somehow postgres is able to compress the bigints better
;;  2. Less chance of an overflow error, but if the counts get that high,
;;     then the sketch probably won't work that well anyway?
;;  3. It's hard to get clojure to stick to ints and will probably create bugs
;; It would be nice to use ints because they're smaller and faster

;; How the process can work:
;; 1. Fetch all of the triples for an attr
;; 2. Start listening to the wal for that attr and queue up any changes
;; We might miss some data, maybe we could take a lock on the triples table
;; while we're fetching the triples for that attr?
;; Alternatively, we could keep track of every primary key?

;; Process for watching the wal
;; 1. update comes in
;; 2. if the triple is created, deleted, or has a value change, we put it in a queue of
;;    items to process
;; 3. Every so often, we flush the writes and update a record that to the lastapplied lsn
;; 4. When the transaction comes back, then we tell the server what we've applied
;; 5. If there is an error, then we can restart from the value in the db

;; We could have one instance that talks to the persistant wal log and whoever gets subscribed
;; to that one is the one that updates the counts
;;

(defn- find-sketch-rows
  "Takes a set of {:app-id :attr-id} maps and returns a list of sketch
   db records."
  [conn keys]
  (let [q (hsql/format {:select :*
                        :from :attr-sketches
                        :where [:in
                                [:composite :app-id :attr-id]
                                {:select [[[:unnest :?app-ids] :app-id]
                                          [[:unnest :?attr-ids] :attr-id]]}]}
                       {:params {:app-ids (with-meta (mapv :app-id keys)
                                            {:pgtype "uuid[]"})
                                 :attr-ids (with-meta (mapv :attr-id keys)
                                             {:pgtype "uuid[]"})}})]
    (sql/select ::find-sketches conn q)))

(defn- create-sketch-rows!
  "Takes a set of {:app-id :attr-id} maps and returns a list of sketch
   db records."
  [conn keys]
  (let [sketch (make-sketch)
        params (assoc (select-keys sketch
                                   [:width
                                    :depth
                                    :total
                                    :total-not-binned])
                      :bins (with-meta (:bins sketch)
                              {:pgtype "bigint[]"})
                      :app-ids (with-meta (mapv :app-id keys)
                                 {:pgtype "uuid[]"})
                      :attr-ids (with-meta (mapv :attr-id keys)
                                  {:pgtype "uuid[]"}))
        cols [:id :app-id :attr-id :width :depth :total :total-not-binned :bins]
        q (hsql/format {:with [[:data {:select [[:%gen_random_uuid :id]
                                                [[:unnest :?app-ids] :app-id]
                                                [[:unnest :?attr-ids] :attr-id]
                                                [:?width :width]
                                                [:?depth :depth]
                                                [:?total :total]
                                                [:?total-not-binned :total-not-binned]
                                                [:?bins :bins]]}]]
                        :insert-into [[:attr-sketches (conj cols)]
                                      {:select cols
                                       :from :data}]
                        :returning :*}
                       {:params params})]
    (sql/execute! ::create-sketches
                  conn
                  q
                  ;; Don't send the bins to honeycomb
                  {:skip-log-params (not= :dev (config/get-env))})))

(defn record->Sketch [record]
  {:sketch (map->Sketch {:width (:width record)
                         :depth (:depth record)
                         :bins (:bins record)
                         :total (:total record)
                         :total-not-binned (:total_not_binned record)})
   :id (:id record)
   :app-id (:app_id record)
   :attr-id (:attr_id record)
   :max-lsn (:max_lsn record)})

(defn find-or-create-sketches!
  "Takes a set of {:app-id :attr-id} maps and returns a map of
   {:app-id :attr-id} to sketch record."
  [conn keys]
  (let [existing (find-sketch-rows conn keys)
        {:keys [results missing-keys]}
        (reduce (fn [acc res]
                  (let [result (record->Sketch res)
                        k (select-keys result [:app-id :attr-id])]
                    (-> acc
                        (assoc-in [:results k] result)
                        (update :missing-keys disj k))))
                {:results {}
                 :missing-keys (set keys)}
                existing)]
    (if-not (seq missing-keys)
      results
      (reduce (fn [acc res]
                (let [result (record->Sketch res)
                      k (select-keys result [:app-id :attr-id])]
                  (assoc acc k result)))
              results
              (create-sketch-rows! conn missing-keys)))))

(def wal-aggregator-status-id :1)

(defn save-sketches! [conn {:keys [sketches
                                   previous-lsn
                                   lsn]}]
  (let [q {:with [[[:data
                    {:columns [:id :total :total-not-binned :max-lsn :bins]}]
                   {:values (map-indexed
                              (fn [i {:keys [id sketch] :as record}]
                                [id
                                 (:total sketch)
                                 (:total-not-binned sketch)
                                 (:max-lsn record)
                                 (keyword (str "?bins-" i))])
                              sketches)}]
                  [:update-sketches
                   {:update :attr_sketches
                    :from :data
                    :set {:total :data.total
                          :total-not-binned :data.total-not-binned
                          :max-lsn :data.max-lsn
                          :bins :data.bins}
                    :where [:= :attr_sketches.id :data.id]}]
                  [:update-wal-aggregator-status
                   {:update :wal-aggregator-status
                    :set {:lsn lsn
                          :process-id @config/process-id}
                    :where [:and
                            [:= :lsn previous-lsn]
                            [:= :id wal-aggregator-status-id]]
                    :returning :*}]
                  [:check-empty
                   {:select [[[:case [[:exists {:select :1 :from :update-wal-aggregator-status}]]
                               true
                               :else [:raise_exception_message [:inline "lsn is not what we expected, another machine may have stolen the replication slot"]]]
                              :ok]]}]]
           :select :*
           :from :update-wal-aggregator-status
           :where [:= true {:select :ok :from :check-empty}]}
        params (reduce-kv (fn [params i {:keys [sketch]}]
                            (assoc params
                                   (keyword (str "bins-" i))
                                   (with-meta (:bins sketch)
                                     {:pgtype "bigint[]"})))
                          {}
                          sketches)]
    (sql/execute-one! ::save-sketches!
                      conn
                      (hsql/format q {:params params})
                      ;; Don't send the bins to honeycomb
                      {:skip-log-params (not= :dev (config/get-env))})))

;; Experiment with dynamic sketches:
;; We could keep sketches smaller by adding an additional sketch
;; once you reach a certain number of items in the sketch.
;; you just have to keep track of a `height` or something and
;; then you can break the bins into smaller sketches.
;; That way we could keep the sketches small initially, but still support
;; attrs with a ton of triples.
;; When you want to check a count, you just sum the counts for all of
;; the sketches.
;; And instead of a confidence and error rate, you give a max-deviation?
;; There's something else there so that the error doesn't accumulate as
;; the sketch increases in size.

;; Need to keep track of layer totals so that we know when to split again.
;; If we do a bunch of deletes after doing a bunch of adds, how do we know
;; whether our second layer is full?
;; Maybe you handle deletes separately? If you have a delete, then you have
;; to check if it's in a lower sketch and then you can remove it from that
;; lower sketch first?

(defrecord Sketch3D [width
                     depth
                     height
                     bins
                     total
                     total-not-binned])

(defmethod clojure.pprint/simple-dispatch Sketch3D [x]
  (#'clojure.pprint/pprint-map (into {} (assoc x :bins '<bins>))))

(defn make-3d-sketch
  ([] (make-3d-sketch {}))
  ([{:keys [confidence error-rate]
     :or {confidence 0.99
          error-rate 0.01}}]
   (let [width (Math/ceil (/ 2 error-rate))
         depth (Math/ceil (/ (* -1 (Math/log (- 1 confidence)))
                             ln2))]
     (map->Sketch {:width (int width)
                   :depth (int depth)
                   :height 1
                   :bins (vec (repeat (* width depth) 0))
                   :total 0
                   :total-not-binned 0}))))

(defn add-3d
  [^Sketch3D sketch checked-data-type v_]
  (if-let [[data-type v] (data-type-for-hash checked-data-type v_)]
    ;; Only track counts for the items that you can query for
    (if (< (* 250000
              (:height sketch)
              (:height sketch))
           (inc (- (:total sketch)
                   (:total-not-binned sketch))))
      (do
        (println (format "increasing size max-size=%s next-size=%s"
                         (* 250000
                            (:height sketch)
                            (:height sketch))
                         (inc (- (:total sketch)
                                 (:total-not-binned sketch)))))
        (recur (-> sketch
                   (update :height inc)
                   (update :bins (fn [bins]
                                   (apply conj bins (repeat (* (:width sketch)
                                                               (:depth sketch)
                                                               (inc (:height sketch))
                                                               (inc (:height sketch)))
                                                            0)))))
               checked-data-type
               v_))
      (let [seed (hash-val 0 -1 data-type v)
            ;; XXX: bin-offset might be the wrong way to do it?
            bin-offset (int (reduce (fn [acc x]
                                      (+ acc (* (:width sketch) (:depth sketch) x x)))
                                    0
                                    (range (:height sketch))))
            width (* (:width sketch) (:height sketch))
            depth (* (:depth sketch) (:height sketch))
            _ (tool/def-locals)
            bins (persistent!
                  (reduce (fn [bins i]
                            (let [hash (hash-val seed i data-type v)
                                  bin-idx (+ bin-offset
                                             (int (+ (Long/remainderUnsigned hash
                                                                             width)
                                                     (* i width))))]
                              (assoc! bins bin-idx (+ (get bins bin-idx)
                                                      1))))
                          (transient (:bins sketch))
                          (range depth)))]
        (-> sketch
            (update :total + 1)
            (assoc :bins bins))))
    ;; Track totals even if you can't query for the item
    (-> sketch
        (update sketch :total + 1)
        (update sketch :total-not-binned + 1))))

(defn check-3d [^Sketch3D sketch checked-data-type val_]
  (let [[data-type val] (data-type-for-hash checked-data-type val_)
        _ (assert data-type (format "Unknown data for sketch %s" val))
        seed (hash-val 0 -1 data-type val)]
    (reduce (fn [acc h]
              (let [height (inc h)
                    bin-offset (tool/inspect (int (reduce (fn [acc x]
                                                            (+ acc (* (:width sketch) (:depth sketch) x x)))
                                                          0
                                                          (range height))))
                    width (* (:width sketch) height)
                    depth (* (:depth sketch) height)]
                (+ acc
                   (reduce (fn [m i]
                             (let [hash (hash-val seed i data-type val)
                                   bin-idx (+ bin-offset
                                              (int (+ (Long/remainderUnsigned hash
                                                                              width)
                                                      (* i width))))
                                   bin-val (nth (:bins sketch) bin-idx)]
                               (if m
                                 (min bin-val m)
                                 bin-val)))
                           nil
                           (range depth)))))
            0
            (range (:height sketch)))))
