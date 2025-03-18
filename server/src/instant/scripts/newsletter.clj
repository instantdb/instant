(ns instant.scripts.newsletter
  "Send newsletters to our users

  Usage: First run through these steps to prepare the email content
    1. Create email content in Dropbox. Get sign off on the copy.
    2. Export content as markdown and save to `www/intern/_emails/markdown/[slug].md`
    3. Preview the styled markdown at `localhost:3000/intern/emails/[slug]`
    4. Once preview looks good, you can generate images, html and text versions of the email
       from `client/Makefile` via `make build-email slug=[slug] `
       Notes:
        * We want both html and text to maximize delivery
        * We use pandoc to convert markdown to html. If you don't have it,
          you can install it via `brew install pandoc`
        * We extract dropbox paper image references from the markdown, save
          the images to 'client/www/public/img/emails/[slug]/', and replace
          dropbox paper image references with the new image paths
        * If need be, you can edit the ouputs in`client/www/_emails/html/[slug].html`
          and `client/www/_emails/txt/[slug].txt`
    5. Refresh the page at `localhost:3000/intern/emails/[slug]`
       and verify text version looks good via the text view button
    6. Once everything looks good open a PR with the changes. Make sure to
       merge the PR before sending the newsletter for images to work

    And now go through the comment block at the bottom of this file to send
    out the newsletter. Huzzah!
  "

  (:require
   [instant.config :as config]
   [clj-http.client :as clj-http]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [instant.util.json :refer [->json]]
   [instant.util.tracer :as tracer]
   [clojure.tools.logging :as log]))

(def base-path (io/file (.getParent (io/file *file*)) "../../../../"))
(def emails-path "server/resources/emails/emails.txt")
(defn html-path [slug] (str "client/www/_emails/html/" slug ".html"))
(defn txt-path [slug] (str "client/www/_emails/txt/" slug ".txt"))

(defonce sent-already? (atom false))
(defonce errors (atom []))
(comment
  (reset! sent-already? false)
  (reset! errors []))

(defn read-file
  "Reads a file relative to a base path"
  [base-path file-path]
  (let [full-path (io/file base-path file-path)]
    (slurp full-path)))

(comment
  (read-file base-path (html-path "oct2024"))
  (read-file base-path (txt-path "oct2024")))

(defn inactive-recipient? [e]
  (= 406 (-> e ex-data :body :ErrorCode)))

(defn add-error! [email error-type message]
  (let [timestamp (java.time.LocalDateTime/now)
        error-entry {:timestamp timestamp
                     :email email
                     :error-type error-type
                     :message message}]
    (swap! errors conj error-entry)))

(defn handle-email-error! [^Throwable e to]
  (if (inactive-recipient? e)
    (add-error! to "INACTIVE_RECIPIENT" "This email address has been marked inactive.")
    (add-error! to "ERROR" (.getMessage e)))
  nil)

(defn send! [{:keys [to title textBody htmlBody
                     ;; alias refers to the email template identifer in postmark
                     ;; In general you shouldn't need to provide any of these
                     ;; optional params unless you're sending a custom email
                     alias from reply-to]
              :or {alias "instant-news"
                   from "js@hey.instantdb.com"
                   reply-to "founders@instantdb.com"}}]
  (let [model {:title title
               :textBody textBody
               :htmlBody htmlBody}
        body {:From from
              :To to
              :ReplyTo reply-to
              :TemplateAlias alias
              :TemplateModel model
              :MessageStream "broadcast"
              :TrackOpens true
              :TrackLinks "HtmlAndText"
              :InlineCss true}]
    (if-not (config/postmark-send-enabled?)
      (tracer/with-span! {:name "postmark/send-disabled"
                          :attributes body}
        (tracer/record-info!
         {:name "postmark-disabled"
          :attributes
          {:msg
           "Postmark is disabled, add postmark-token to config to enable"}}))
      (tracer/with-span! {:name "postmark/send"
                          :attributes body}
        (try
          (clj-http/post
           "https://api.postmarkapp.com/email/withTemplate"
           {:coerce :always
            :as :json
            :headers {"X-Postmark-Server-Token" (config/postmark-token)
                      "Content-Type" "application/json"}
            :body (->json body)})
          (catch Exception e
            (handle-email-error! e to)))))))

(defn send-newsletter! [{:keys [title slug live?]}]
  (let [emails (str/split-lines (read-file base-path emails-path))]
    (if-not live?
      (doseq [email emails]
        (log/info "Simulating sending newsletter to" email))
      (if @sent-already?
        (throw (Exception. "Already sent newsletter! Set sent-already? to false to send again."))
        (do
          (reset! sent-already? true)
          (doseq [email emails]
            (let [htmlBody (read-file base-path (html-path slug))
                  textBody (read-file base-path (txt-path slug))]
              (send! {:to email
                      :title title
                      :htmlBody htmlBody
                      :textBody textBody}))))))))

(comment
  ;; 1. Set your params
  (def params {:title "Instant News - MMM YYYY" :slug "mmmYYYY"})

  ;; 2. Send test email to yourself, verify looks good
  (let [htmlBody (read-file base-path (html-path (:slug params)))
        textBody (read-file base-path (txt-path (:slug params)))]
    (send! (assoc params
                  :to "joeaverbukh@gmail.com"
                  :htmlBody htmlBody
                  :textBody textBody)))

  ;; 3. Add emails to server/resources/emails/emails.txt
  ;; make sure each email is on a new line, with no trailing commas. e.g.
  ;; joeaverbukh@gmail.com
  ;; stepan.p@gmail.com
  ;;
  ;; Run this to preview email list looks good
  (send-newsletter! (assoc params :live? false))

  ;; 4. Send newsletter!
  (send-newsletter! (assoc params :live? true))

  ;; 5. Check for errors
  (identity @errors))
