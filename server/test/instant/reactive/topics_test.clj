(ns instant.reactive.topics-test
  (:require
   [clojure.string :as string]
   [clojure.test :refer [deftest testing is]]
   [instant.data.resolvers :as resolvers]
   [instant.db.model.attr :as attr-model]
   [instant.db.transaction :as tx]
   [instant.fixtures :refer [with-zeneca-app]]
   [instant.flags :as flags]
   [instant.jdbc.aurora :as aurora]
   [instant.reactive.invalidator :as inv]
   [instant.reactive.topics :as topics]
   [instant.util.test :refer [wait-for stuid]]))

(defn with-invalidator-setup [f]
  (with-zeneca-app
    (fn [app r]
      (println "za")
      (let [invalidate! (var-get #'inv/invalidate!)
            enable-wal-entity-log? (var-get #'flags/enable-wal-entity-log?)
            records (atom clojure.lang.PersistentQueue/EMPTY)
            machine-id (string/replace (str "test-" (random-uuid))
                                       #"-"
                                       "_")]
        (with-redefs [flags/enable-wal-entity-log? (fn [app-id]
                                                     (if (= app-id (:id app))
                                                       true
                                                       (enable-wal-entity-log? app-id)))
                      inv/invalidate!
                      (fn [process-id store {:keys [app-id] :as wal-record}]
                        (if (= machine-id process-id)
                          (when (= (:id app) app-id)
                            (swap! records conj wal-record))
                          (invalidate! process-id store wal-record)))]
          (let [process (time (inv/start machine-id))]
            (try
              (f app r records)
              (finally
                (inv/stop process)))))))))

(defn grab-record [records]
  (ffirst (swap-vals! records (fn [records]
                                (pop records)))))

(defn wait-for-record [wal-records]
  (time (wait-for (fn []
                    (< 0 (count @wal-records)))
                  1000
                  2))
  (grab-record wal-records))

(deftest entities-works
  (with-invalidator-setup
    (fn [app _r wal-records]
      (tx/transact! (aurora/conn-pool :write)
                    (attr-model/get-by-app-id (:id app))
                    (:id app)
                    [[:add-attr {:id (random-uuid)
                                 :forward-identity [(random-uuid) "users" "favorite"]
                                 :reverse-identity [(random-uuid) "books" "favoritedBy"]
                                 :unique? false
                                 :index? false
                                 :value-type :ref
                                 :cardinality :one}]])
      (wait-for-record wal-records)
      (let [attrs (attr-model/get-by-app-id (:id app))
            r (resolvers/make-zeneca-resolver (:id app))]
        (tool/def-locals)
        (testing "add a new entity"
          (is (tx/transact! (aurora/conn-pool :write)
                            attrs
                            (:id app)
                            [[:add-triple (stuid "dww") (resolvers/->uuid r :users/id) (stuid "dww")]
                             [:add-triple (stuid "dww") (resolvers/->uuid r :users/handle) "dww"]]))

          (let [record (wait-for-record wal-records)
                entities-after (topics/extract-entities-after record)
                entities-before (topics/extract-entities-before attrs entities-after record)]
            (is (= (resolvers/walk-friendly r entities-after)
                   {"users"
                    {(str (stuid "dww"))
                     #:users{:id (str (stuid "dww"))
                             :email nil,
                             :handle "dww"}}}))
            (is (= (resolvers/walk-friendly r entities-before)
                   {}))))

        (testing "delete an entity"
          (is (tx/transact! (aurora/conn-pool :write)
                            attrs
                            (:id app)
                            [[:delete-entity (stuid "dww") "users"]]))
          (let [record (wait-for-record wal-records)
                entities-after (topics/extract-entities-after record)
                entities-before (topics/extract-entities-before attrs entities-after record)]

            (is (= (resolvers/walk-friendly r entities-after)
                   {}))

            (is (= (resolvers/walk-friendly r entities-before)
                   {"users"
                    {(str (stuid "dww"))
                     #:users{:id (str (stuid "dww"))
                             :email nil,
                             :handle "dww"}}}))))

        (testing "create a one-to-many link"
          (is (tx/transact! (aurora/conn-pool :write)
                            attrs
                            (:id app)
                            [[:add-triple
                              (resolvers/->uuid r "eid-alex")
                              (resolvers/->uuid r :users/favorite)
                              (resolvers/->uuid r "eid-sum")]]))
          (let [record (wait-for-record wal-records)
                entities-after (topics/extract-entities-after record)
                entities-before (topics/extract-entities-before attrs entities-after record)]

            (def -rec record)
            (is (= (resolvers/walk-friendly r entities-before)
                   {"users"
                    {"eid-alex"
                     #:users{:fullName "Alex",
                             :email "alex@instantdb.com",
                             :createdAt "2021-01-09 18:53:07.993689",
                             :id "eid-alex",
                             :handle "alex"}}
                    "books"
                    {"eid-sum"
                     #:books{:pageCount 107,
                             :title "Sum",
                             :id "eid-sum",
                             :thumbnail
                             "http://books.google.com/books/content?id=-cjWiI8DEywC&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api",
                             :description
                             "At once funny, wistful and unsettling, Sum is a dazzling exploration of unexpected afterlives—each presented as a vignette that offers a stunning lens through which to see ourselves in the here and now. In one afterlife, you may find that God is the size of a microbe and unaware of your existence. In another version, you work as a background character in other people’s dreams. Or you may find that God is a married couple, or that the universe is running backward, or that you are forced to live out your afterlife with annoying versions of who you could have been. With a probing imagination and deep understanding of the human condition, acclaimed neuroscientist David Eagleman offers wonderfully imagined tales that shine a brilliant light on the here and now. From the Trade Paperback edition."}},}))

            (is (= (resolvers/walk-friendly r entities-after)
                   {"users"
                    {"eid-alex"
                     #:users{:fullName "Alex",
                             :email "alex@instantdb.com",
                             :createdAt "2021-01-09 18:53:07.993689",
                             :id "eid-alex",
                             :handle "alex"
                             :favorite "eid-sum"}}
                    "books"
                    {"eid-sum"
                     #:books{:pageCount 107,
                             :title "Sum",
                             :id "eid-sum",
                             :thumbnail
                             "http://books.google.com/books/content?id=-cjWiI8DEywC&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api",
                             :description
                             "At once funny, wistful and unsettling, Sum is a dazzling exploration of unexpected afterlives—each presented as a vignette that offers a stunning lens through which to see ourselves in the here and now. In one afterlife, you may find that God is the size of a microbe and unaware of your existence. In another version, you work as a background character in other people’s dreams. Or you may find that God is a married couple, or that the universe is running backward, or that you are forced to live out your afterlife with annoying versions of who you could have been. With a probing imagination and deep understanding of the human condition, acclaimed neuroscientist David Eagleman offers wonderfully imagined tales that shine a brilliant light on the here and now. From the Trade Paperback edition."}}}))))

        (testing "remove a one-to-many link"
          (is (tx/transact! (aurora/conn-pool :write)
                            attrs
                            (:id app)
                            [[:retract-triple
                              (resolvers/->uuid r "eid-alex")
                              (resolvers/->uuid r :users/favorite)
                              (resolvers/->uuid r "eid-sum")]]))
          (let [record (wait-for-record wal-records)
                entities-after (topics/extract-entities-after record)
                entities-before (topics/extract-entities-before attrs entities-after record)]

            ;; Many-to-many links
            (is (= (resolvers/walk-friendly r entities-before)
                   {"users"
                    {"eid-alex"
                     #:users{:fullName "Alex",
                             :email "alex@instantdb.com",
                             :createdAt "2021-01-09 18:53:07.993689",
                             :id "eid-alex",
                             :handle "alex"
                             :favorite "eid-sum"}}
                    "books"
                    {"eid-sum"
                     #:books{:pageCount 107,
                             :title "Sum",
                             :id "eid-sum",
                             :thumbnail
                             "http://books.google.com/books/content?id=-cjWiI8DEywC&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api",
                             :description
                             "At once funny, wistful and unsettling, Sum is a dazzling exploration of unexpected afterlives—each presented as a vignette that offers a stunning lens through which to see ourselves in the here and now. In one afterlife, you may find that God is the size of a microbe and unaware of your existence. In another version, you work as a background character in other people’s dreams. Or you may find that God is a married couple, or that the universe is running backward, or that you are forced to live out your afterlife with annoying versions of who you could have been. With a probing imagination and deep understanding of the human condition, acclaimed neuroscientist David Eagleman offers wonderfully imagined tales that shine a brilliant light on the here and now. From the Trade Paperback edition."}}}))

            (is (= (resolvers/walk-friendly r entities-after)
                   {"users"
                    {"eid-alex"
                     #:users{:fullName "Alex",
                             :email "alex@instantdb.com",
                             :createdAt "2021-01-09 18:53:07.993689",
                             :id "eid-alex",
                             :handle "alex"}}
                    "books"
                    {"eid-sum"
                     #:books{:pageCount 107,
                             :title "Sum",
                             :id "eid-sum",
                             :thumbnail
                             "http://books.google.com/books/content?id=-cjWiI8DEywC&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api",
                             :description
                             "At once funny, wistful and unsettling, Sum is a dazzling exploration of unexpected afterlives—each presented as a vignette that offers a stunning lens through which to see ourselves in the here and now. In one afterlife, you may find that God is the size of a microbe and unaware of your existence. In another version, you work as a background character in other people’s dreams. Or you may find that God is a married couple, or that the universe is running backward, or that you are forced to live out your afterlife with annoying versions of who you could have been. With a probing imagination and deep understanding of the human condition, acclaimed neuroscientist David Eagleman offers wonderfully imagined tales that shine a brilliant light on the here and now. From the Trade Paperback edition."}}}
                   ))))

        (testing "create a many-to-many link"
          (is (tx/transact! (aurora/conn-pool :write)
                            attrs
                            (:id app)
                            [[:add-triple
                              (resolvers/->uuid r "eid-alex")
                              (resolvers/->uuid r :users/bookshelves)
                              (resolvers/->uuid r "eid-the-way-of-the-gentleman")]]))
          (let [record (wait-for-record wal-records)
                entities-after (topics/extract-entities-after record)
                entities-before (topics/extract-entities-before attrs entities-after record)]


            (is (= (resolvers/walk-friendly r entities-after)
                   (resolvers/walk-friendly r entities-before)
                   {"bookshelves"
                    {"eid-the-way-of-the-gentleman"
                     #:bookshelves{:name "The Way of The Gentleman",
                                   :id "eid-the-way-of-the-gentleman",
                                   :desc
                                   "Most of my heroes are fictional characters from the 19th Century. The ideas of chivalry and honor form the foundation of my personal philosophy. I'm heavily influenced by Rafael Sabatini and Dumas. I’ve read The Count of Monte Cristo about four times now. I’ve re-read a bunch of Sabatini: I’d suggest starting with Scaramouche, Captain Blood, Bellarion, or Bardelys the Magnificent. Two other titles I’d particularly recommend are Taiko, and Musashi, by Eiji Yoshikawa. From these books you’ll get a sense of what it’s like to live life with formidable values.",
                                   :order 1}},
                    "users"
                    {"eid-alex"
                     #:users{:createdAt "2021-01-09 18:53:07.993689",
                             :fullName "Alex",
                             :handle "alex",
                             :id "eid-alex",
                             :email "alex@instantdb.com"}}}))))

        (testing "remove a many-to-many link"
          (is (tx/transact! (aurora/conn-pool :write)
                            attrs
                            (:id app)
                            [[:retract-triple
                              (resolvers/->uuid r "eid-alex")
                              (resolvers/->uuid r :users/bookshelves)
                              (resolvers/->uuid r "eid-the-way-of-the-gentleman")]]))
          (let [record (wait-for-record wal-records)
                entities-after (topics/extract-entities-after record)
                entities-before (topics/extract-entities-before attrs entities-after record)]

            ;; Many-to-many links
            (is (= (resolvers/walk-friendly r entities-after)
                   (resolvers/walk-friendly r entities-before)
                   {"bookshelves"
                    {"eid-the-way-of-the-gentleman"
                     #:bookshelves{:name "The Way of The Gentleman",
                                   :id "eid-the-way-of-the-gentleman",
                                   :desc
                                   "Most of my heroes are fictional characters from the 19th Century. The ideas of chivalry and honor form the foundation of my personal philosophy. I'm heavily influenced by Rafael Sabatini and Dumas. I’ve read The Count of Monte Cristo about four times now. I’ve re-read a bunch of Sabatini: I’d suggest starting with Scaramouche, Captain Blood, Bellarion, or Bardelys the Magnificent. Two other titles I’d particularly recommend are Taiko, and Musashi, by Eiji Yoshikawa. From these books you’ll get a sense of what it’s like to live life with formidable values.",
                                   :order 1}},
                    "users"
                    {"eid-alex"
                     #:users{:createdAt "2021-01-09 18:53:07.993689",
                             :fullName "Alex",
                             :handle "alex",
                             :id "eid-alex",
                             :email "alex@instantdb.com"}}}))))))))
