(ns instant.restore-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer [deftest is testing]]
   [instant.db.model.attr :as attr-model]
   [instant.fixtures :refer [with-user]]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.model.app :as app-model]
   [instant.restore :as restore]
   [instant.util.json :as json])
  (:import
   (java.io BufferedReader InputStreamReader)
   (java.nio.charset StandardCharsets)
   (java.util.zip ZipFile)))

;; A real backup of a zeneca app (config.json + entities/*.jsonl, no stored
;; files), checked into dev-resources so we can exercise the whole restore flow.
(def zeneca-backup-path
  (-> (io/resource "zeneca-backup.zip") io/as-file .getPath))

(def entities-prefix "entities/")
(def entities-suffix ".jsonl")

(defn backup-triples
  "Independently reconstructs the set of [entity-id attr-id value] triples the
   backup should produce, reading the zip's entities/*.jsonl directly and
   resolving attr-ids against the restored app's attrs. This is the ground truth
   we compare the restored database against."
  [zip-path attrs]
  (with-open [zin (ZipFile. ^String zip-path)]
    (reduce
     (fn [acc ^java.util.zip.ZipEntry entry]
       (let [name (.getName entry)]
         (if-not (and (.startsWith name entities-prefix)
                      (.endsWith name entities-suffix))
           acc
           (let [etype (subs name (count entities-prefix)
                             (- (count name) (count entities-suffix)))]
             (with-open [in (.getInputStream zin entry)
                         rdr (BufferedReader. (InputStreamReader. in StandardCharsets/UTF_8))]
               (reduce
                (fn [acc row]
                  (let [entity (get row "entity")
                        entity-id (-> entity (get "id") parse-uuid)]
                    (reduce-kv
                     (fn [acc k v]
                       (let [attr (attr-model/seek-by-fwd-ident-name [etype k] attrs)
                             ;; cardinality-many fields carry an array of values
                             vs (if (= :many (:cardinality attr)) v [v])]
                         (into acc (map (fn [v] [entity-id (:id attr) v]) vs))))
                     acc
                     entity)))
                acc
                (json/parsed-seq rdr)))))))
     #{}
     (enumeration-seq (.entries zin)))))

(defn db-triples
  "The set of [entity-id attr-id value] triples actually stored for the app."
  [app-id]
  (->> (sql/select ::db-triples
                   (aurora/conn-pool :read)
                   ["select entity_id, attr_id, cast(value as text) as value
                     from triples where app_id = ?::uuid"
                    app-id])
       (map (fn [{:keys [entity_id attr_id value]}]
              [entity_id attr_id (json/<-json value)]))
       set))

(deftest restore-faithfully-reproduces-the-backup
  (with-user
    (fn [user]
      (let [app-id (restore/restore-from-zip {:zip-file-path zeneca-backup-path
                                              :creator-id (:id user)
                                              :title "zeneca-restore-test"})]
        (try
          (let [attrs    (attr-model/get-by-app-id app-id)
                expected (backup-triples zeneca-backup-path attrs)
                actual   (db-triples app-id)]

            (testing "the app is created, titled, and transferred to the creator"
              ;; read from the write pool to bypass the app cache
              (let [app (app-model/get-by-id (aurora/conn-pool :write) {:id app-id})]
                (is (some? app))
                (is (= "zeneca-restore-test" (:title app)))
                (is (= (:id user) (:creator_id app)))))

            (testing "the backup actually contains a meaningful amount of data"
              ;; guards against a silent no-op restore comparing empty=empty
              (is (< 1000 (count expected))))

            (testing "the schema was restored (every backup field resolved to an attr)"
              (is (not (contains? (set (map second expected)) nil))))

            (testing "every backup triple is restored, with nothing missing or extra"
              (is (= expected actual))))

          (finally
            (app-model/delete-immediately-by-id! {:id app-id})))))))
