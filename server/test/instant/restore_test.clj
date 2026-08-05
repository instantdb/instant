(ns instant.restore-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer [deftest is testing]]
   [instant.db.instaql :as iq]
   [instant.db.model.attr :as attr-model]
   [instant.fixtures :refer [with-user]]
   [instant.jdbc.aurora :as aurora]
   [instant.jdbc.sql :as sql]
   [instant.model.app :as app-model]
   [instant.restore :as restore]
   [instant.util.instaql :refer [instaql-nodes->object-tree]]
   [instant.util.json :as json])
  (:import
   (java.io BufferedReader InputStreamReader)
   (java.nio.charset StandardCharsets)
   (java.util.zip ZipEntry ZipFile)))

;; A real backup of a zeneca app (config.json + entities/*.jsonl, no stored
;; files), checked into dev-resources so we can exercise the whole restore flow.
(def zeneca-backup-path
  (-> (io/resource "zeneca-backup.zip") io/as-file .getPath))

(def entities-prefix "entities/")
(def entities-suffix ".jsonl")

(defn backup-triples
  "Independently reconstructs the set of [entity-id attr-id value] triples the
   backup should produce, reading the zip's entities/*.jsonl directly and
   resolving attr-ids against the restored app's attrs — the ground truth we
   compare the restored database against."
  [zip-path attrs]
  (with-open [zin (ZipFile. ^String zip-path)]
    (reduce
     (fn [acc ^ZipEntry entry]
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

(defn query-app [ctx q]
  (instaql-nodes->object-tree ctx (iq/query ctx q)))

(deftest restore-from-zip-restores-zeneca
  (with-user
    (fn [user]
      (let [app-id (restore/restore-from-zip {:zip-file-path zeneca-backup-path
                                              :creator-id (:id user)
                                              :title "zeneca-restore-test"})]
        (try
          (let [attrs (attr-model/get-by-app-id app-id)
                ctx   {:db {:conn-pool (aurora/conn-pool :read)}
                       :app-id app-id
                       :attrs attrs}]

            (testing "the app is created, titled, and transferred to the creator"
              ;; read from the write pool to bypass the app cache
              (let [app (app-model/get-by-id (aurora/conn-pool :write) {:id app-id})]
                (is (some? app))
                (is (= "zeneca-restore-test" (:title app)))
                (is (= (:id user) (:creator_id app)))))

            (testing "querying users returns all of the restored emails"
              (is (= #{"stopa@instantdb.com"
                       "joe@instantdb.com"
                       "alex@instantdb.com"
                       "nicole@instantdb.com"}
                     (->> (get (query-app ctx {:users {}}) "users")
                          (map #(get % "email"))
                          set))))

            (testing "querying a user's bookshelves returns the right ones (links restored)"
              (let [users (get (query-app ctx {:users {:$ {:where {:handle "alex"}}
                                                       :bookshelves {}}})
                               "users")]
                (is (= 1 (count users)))
                (is (= #{"Nonfiction" "Short Stories"}
                       (->> (get (first users) "bookshelves")
                            (map #(get % "name"))
                            set)))))

            (testing "every backup triple is restored, with nothing missing or extra"
              (is (= (backup-triples zeneca-backup-path attrs)
                     (db-triples app-id)))))

          (finally
            (app-model/delete-immediately-by-id! {:id app-id})))))))
