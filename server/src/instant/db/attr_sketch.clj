(ns instant.db.attr-sketch
  (:require
   [clojure.pprint]
   [honey.sql :as hsql]
   [instant.jdbc.sql :as sql]
   [instant.util.coll :as ucoll]
   [instant.util.tracer :as tracer])
  (:import
   (com.github.luben.zstd Zstd)
   (java.lang Long)
   (java.math BigInteger)
   (java.nio ByteBuffer)
   (java.time Instant)
   (net.openhft.hashing LongHashFunction)))

(set! *warn-on-reflection* true)

(def debug-queries false)

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
     :or {confidence 0.999
          error-rate 0.0001}}]
   (let [width (int (Math/ceil (/ 2 error-rate)))
         depth (int (Math/ceil (/ (* -1 (Math/log (- 1 confidence)))
                                  ln2)))]
     (map->Sketch {:width width
                   :depth depth
                   :bins (vec (repeat (* width depth) 0))
                   :total 0
                   :total-not-binned 0}))))

(defn data-type-for-hash [checked-data-type x]
  (if (nil? x)
    [:nil nil]
    (case checked-data-type
      :number (condp instance? x
                java.lang.Long [:long x]
                java.lang.Integer [:long (long x)]
                java.lang.Double [:double x]
                java.math.BigInteger [:bigint x])
      :string (if (string? x)
                [:string x]
                (throw (ex-info "Invalid type for string in data-type-for-hash."
                                {:value x
                                 :expected :string})))
      :boolean (if (boolean? x)
                 [:boolean x]
                 (throw (ex-info "Invalid type for boolean in data-type-for-hash."
                                 {:value x
                                  :expected :boolean})))
      :date (if (instance? Instant x)
              [:long (.toEpochMilli ^Instant x)]
              (throw (ex-info "Invalid type for date in data-type-for-hash."
                              {:value x
                               :expected :instant})))

      (condp instance? x
        java.lang.String [:string x]
        java.lang.Long [:long x]
        java.lang.Integer [:long (long x)]
        java.lang.Double [:double x]
        java.math.BigInteger [:bigint x]
        java.lang.Boolean [:boolean x]
        ;; Use string as the universal format for uuids for the purpose of
        ;; the sketch. We could use bytes, but this will still work if the
        ;; uuid gets passed to us as a string somehow
        java.util.UUID [:string (str x)]
        clojure.lang.PersistentArrayMap nil ;; small objects
        clojure.lang.PersistentHashMap nil ;; large objects
        clojure.lang.PersistentVector nil ;; nested arrays
        clojure.lang.LazySeq nil ;; top-level arrays
        (tracer/with-span! {:name "attr-sketch/unknown-type"
                            :attributes {:warning true
                                         :value x}}
          nil)))))

(defn hash-val [^Long seed ^Long hash-idx data-type val]
  (let [xx (LongHashFunction/xx3 (+ seed hash-idx))]
    (case data-type
      :long (.hashLong xx val)
      :bigint (try (.hashLong xx (BigInteger/.longValueExact val))
                   (catch ArithmeticException _e
                     ;; Only store it as a bigint if it doesn't actually
                     ;; fit in a long
                     (.hashBytes xx (BigInteger/.toByteArray val))))
      :double (.hashLong xx (Double/doubleToLongBits val))
      :string (.hashChars xx ^String val)
      :boolean (.hashBoolean xx val)
      ;; use null byte for nil. postgres will refuse to store it as a
      ;; value, so we know that it's not going to distort counts
      :nil (.hashChar xx \u0000))))

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

(defn check
  "Returns the estimated count for a value from the skech.
   Will throw if the input is not valid (e.g. a JSON array)."
  [^Sketch sketch checked-data-type val_]
  (let [[data-type val] (data-type-for-hash checked-data-type val_)
        _ (when-not data-type
            (throw (ex-info (format
                              "Invalid input to sketch. Can't determine data type for value `%s`."
                              val_)
                            {:input {:checked-data-type checked-data-type
                                     :value val_}})))
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

;; --------
;; Database

;; Wal aggregator

(defn initialize-wal-aggregator-status
  "Used when the sketches are first initialized. Keeps track of where
   we are in the WAL."
  [conn {:keys [lsn slot-name process-id]}]
  (let [status (sql/execute-one! ::intialize-wal-aggregator-status
                                 conn
                                 (hsql/format {:insert-into :wal-aggregator-status
                                               :values [{:lsn lsn
                                                         :slot-name slot-name
                                                         :process-id process-id}]}))]
    (when-not status
      (throw (ex-info "wal-aggregator-status is already initialized" {})))
    status))

(defn get-start-lsn
  "Gets the last committed lsn. We update the lsn in a single
   transaction when we update the sketches, so it is safe to continue
   processing the replication stream from this lsn."
  [conn {:keys [slot-name]}]
  (:lsn (sql/select-one ::get-start-lsn
                        conn
                        (hsql/format {:select :lsn
                                      :from :wal-aggregator-status
                                      :where [:= :slot-name slot-name]}))))

;; Sketches

;;; Compression

(defn compress-bins
  "Returns the bins as bytes compressed with zstd."
  ^bytes [sketch]
  (let [bb (ByteBuffer/allocate (* (:width sketch)
                                   (:depth sketch)
                                   Long/BYTES))]
    (doseq [l (:bins sketch)]
      (.putLong bb l))
    (Zstd/compress (.array bb))))

(defn bytes->longs [^bytes b]
  (let [bb (ByteBuffer/wrap b)]
    (loop [arr (transient [])]
      (if (.hasRemaining bb)
        (recur (conj! arr (.getLong bb)))
        (persistent! arr)))))

(defn decompress-bins [width depth ^bytes compressed-bin-bytes]
  (let [dst (byte-array (* width depth Long/BYTES))]
    (Zstd/decompress dst compressed-bin-bytes)
    (bytes->longs dst)))

;;; Queries

(defn qualify-col [ns col]
  (keyword (format "%s.%s" (name ns) (name col))))

(defn qualify-cols [ns cols]
  (map (partial qualify-col ns) cols))

(defn record->Sketch [record]
  (let [{:keys [width depth bins]} record]
    {:sketch (map->Sketch {:width width
                           :depth depth
                           :bins (decompress-bins width depth bins)
                           :total (:total record)
                           :total-not-binned (:total_not_binned record)})
     :id (:id record)
     :app-id (:app_id record)
     :attr-id (:attr_id record)
     :max-lsn (:max_lsn record)}))

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

(defn all-for-attrs
  "Gets all sketches for attrs, returns a map of {attr-id: sketch}"
  [conn app-id attrs]
  (let [q (hsql/format {:select :*
                        :from :attr-sketches
                        :where [:and
                                [:= :app-id :?app-id]
                                [:= :attr-id [:any :?attr-ids]]]}
                       {:params {:app-id app-id
                                 :attr-ids (with-meta (mapv :id attrs)
                                             {:pgtype "uuid[]"})}})

        rows (sql/select ::all-for-attrs conn q)]
    (ucoll/reduce-tr (fn [acc row]
                       (assoc! acc (:attr_id row) (:sketch (record->Sketch row))))
                     {}
                     rows)))

(defn for-attr
  "Gets sketch for a single attr, returns the sketch row with inflated sketch."
  [conn app-id attr-id]
  (let [q (hsql/format {:select :*
                        :from :attr-sketches
                        :where [:and
                                [:= :app-id :?app-id]
                                [:= :attr-id :?attr-id]]}
                       {:params {:app-id app-id
                                 :attr-id attr-id}})

        row (sql/select-one ::for-attr conn q)]
    (when row
      (record->Sketch row))))

(defn- create-empty-sketch-rows!
  "Takes a set of {:app-id :attr-id} maps, creates a new sketch for each
   and returns a list of sketch db records."
  [conn keys]
  (let [sketch (make-sketch)
        params (assoc (select-keys sketch
                                   [:width
                                    :depth
                                    :total
                                    :total-not-binned])
                      :bins (compress-bins sketch)
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
                        :insert-into [[:attr-sketches cols]
                                      {:select (qualify-cols :data cols)
                                       :from :data
                                       :join [:attrs [:= :attrs.id :data.attr-id]
                                              :apps [:= :apps.id :data.app-id]]}]
                        :returning :*}
                       {:params params})]
    (sql/execute! ::create-empty-sketch-rows!
                  conn
                  q
                  ;; Don't send the bins to honeycomb
                  {:skip-log-params (not debug-queries)})))

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
              (create-empty-sketch-rows! conn missing-keys)))))

(defn save-sketches!
  "Overwrites the sketches and updates the wal-aggregator-status with the latest lsn
   we've processed."
  [conn {:keys [sketches
                previous-lsn
                lsn
                process-id
                slot-name]}]
  (let [params (reduce (fn [acc {:keys [id sketch]}]
                         (let [{:keys [total total-not-binned]} sketch]
                           (-> acc
                               (update :id conj id)
                               (update :total conj total)
                               (update :total-not-binned conj total-not-binned)
                               (update :bins conj (compress-bins sketch)))))
                       {:id (with-meta [] {:pgtype "uuid[]"})
                        :total (with-meta [] {:pgtype "bigint[]"})
                        :total-not-binned (with-meta [] {:pgtype "bigint[]"})
                        :bins (with-meta [] {:pgtype "bytea[]"})
                        :lsn lsn
                        :previous-lsn previous-lsn
                        :slot-name slot-name
                        :process-id process-id}
                       sketches)
        q {:with [[:data {:select [[[:unnest :?id] :id]
                                   [[:unnest :?total] :total]
                                   [[:unnest :?total-not-binned] :total-not-binned]
                                   [[:unnest :?bins] :bins]
                                   [:?lsn :max-lsn]]}]
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
                    :set {:lsn :?lsn
                          :process-id :?process-id}
                    :where [:and
                            [:= :lsn :?previous-lsn]
                            [:= :slot-name :?slot-name]]
                    :returning :*}]
                  [:check-empty
                   {:select [[[:case [[:exists {:select :1 :from :update-wal-aggregator-status}]]
                               true
                               :else [:raise_exception_message [:inline "lsn is not what we expected, another machine may have stolen the replication slot"]]]
                              :ok]]}]]
           :select :*
           :from :update-wal-aggregator-status
           :where [:= true {:select :ok :from :check-empty}]}]
    (sql/execute-one! ::save-sketches!
                      conn
                      (hsql/format q {:params params})
                      ;; Don't send the bins to honeycomb
                      {:skip-log-params (not debug-queries)})))

;; -------------
;; Bootstrapping

(defn insert-initial-sketches!
  "Only should be used during bootstrapping when we initially
   add attr sketches to the database."
  [conn {:keys [sketches
                lsn]}]
  (let [params (reduce (fn [acc {:keys [app-id attr-id sketch]}]
                         (let [{:keys [width depth total total-not-binned]} sketch]
                           (-> acc
                               (update :app-id conj app-id)
                               (update :attr-id conj attr-id)
                               (update :width conj width)
                               (update :depth conj depth)
                               (update :total conj total)
                               (update :total-not-binned conj total-not-binned)
                               (update :bins conj (compress-bins sketch)))))
                       {:app-id (with-meta [] {:pgtype "uuid[]"})
                        :attr-id (with-meta [] {:pgtype "uuid[]"})
                        :width (with-meta [] {:pgtype "integer[]"})
                        :depth (with-meta [] {:pgtype "integer[]"})
                        :total (with-meta [] {:pgtype "bigint[]"})
                        :total-not-binned (with-meta [] {:pgtype "bigint[]"})
                        :bins (with-meta [] {:pgtype "bytea[]"})}
                       sketches)
        cols [:id :max-lsn :app-id :attr-id :width :depth :total :total-not-binned :bins]
        q (hsql/format {:with [[:data {:select [[:%gen_random_uuid :id]
                                                [lsn :max-lsn]
                                                [[:unnest :?app-id] :app-id]
                                                [[:unnest :?attr-id] :attr-id]
                                                [[:unnest :?width] :width]
                                                [[:unnest :?depth] :depth]
                                                [[:unnest :?total] :total]
                                                [[:unnest :?total-not-binned] :total-not-binned]
                                                [[:unnest :?bins] :bins]]}]]
                        :insert-into [[:attr-sketches cols]
                                      {:select (qualify-cols :data cols)
                                       :from :data
                                       ;; Filter out sketches for attrs/apps that were deleted
                                       :join [:attrs [:= :attrs.id :data.attr-id]
                                              :apps [:= :apps.id :data.app-id]]}]}
                       {:params params})]
    (sql/do-execute! ::insert-initial-sketches!
                     conn
                     q
                     ;; Don't send the bins to honeycomb
                     {:skip-log-params (not debug-queries)})))
