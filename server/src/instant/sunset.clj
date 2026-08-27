(ns instant.sunset
  "Operator controls for winding down Instant.

   The global sunset stage lives in the config app's `flags` namespace
   (`sunset-stage`) and overlays every app's own status via
   app-model/apply-sunset-stage. This namespace pushes the new
   effective status to connected sessions when the stage changes and
   lets the intern dashboard update the flag."
  (:require
   [clojure.string :as string]
   [instant.config :as config]
   [instant.db.model.attr :as attr-model]
   [instant.db.transaction :as tx]
   [instant.flags :as flags]
   [instant.jdbc.aurora :as aurora]
   [instant.model.app :as app-model]
   [instant.reactive.store :as rs]
   [instant.stripe :as stripe]
   [instant.util.async :refer [fut-bg]]
   [instant.util.exception :as ex]
   [instant.util.tracer :as tracer]))

;; ----------
;; Broadcast

(defn broadcast-status!
  "Pushes each connected app's effective status to its sessions. The same
   event is sent by cache-evict when an app's own status column changes."
  [store]
  (doseq [app-id (rs/app-ids-with-sessions store)]
    (let [status (name (app-model/get-status app-id))]
      (doseq [{:keys [id]} (rs/all-sockets-for-app store app-id)]
        (rs/try-send-event! store app-id id {:op :app-status-changed
                                             :status status})))))

(defn stage-change-affects-apps?
  "Only stages that overlay app status change what sessions see; a hop
   between :none and :signups-closed doesn't touch apps, so don't wake
   every connected session for it. Takes the raw flag values the
   listener receives."
  [old-value new-value]
  (boolean (some (comp app-model/statuses flags/parse-sunset-stage)
                 [old-value new-value])))

(defonce stop-listener* (atom nil))

(defn start []
  (reset! stop-listener*
          (flags/add-flag-listener
           :sunset-stage
           (fn [_path old-value new-value]
             (let [broadcast? (stage-change-affects-apps? old-value new-value)]
               (tracer/with-span! {:name "sunset/stage-changed"
                                   :attributes {:old-value (str old-value)
                                                :new-value (str new-value)
                                                :broadcast? broadcast?}}
                 (when broadcast?
                   (broadcast-status! rs/store))))))))

(defn stop []
  (when-let [unlisten @stop-listener*]
    (unlisten)
    (reset! stop-listener* nil)))

;; ----------
;; Updating the flag

(defn update-flag!
  "Upserts a `flags` entity in the config app. Relies on `flags.setting`
   being unique so a lookup ref works as an upsert."
  [setting value]
  (let [app-id (or config/instant-config-app-id
                   (ex/throw-validation-err!
                    :sunset
                    setting
                    [{:message "No config app is configured for this environment."}]))
        attrs (attr-model/get-by-app-id app-id)
        id-attr-id (:id (attr-model/seek-by-fwd-ident-name ["flags" "id"] attrs))
        setting-attr-id (:id (attr-model/seek-by-fwd-ident-name ["flags" "setting"] attrs))
        value-attr-id (:id (attr-model/seek-by-fwd-ident-name ["flags" "value"] attrs))]
    (when-not (and id-attr-id setting-attr-id value-attr-id)
      (ex/throw-validation-err!
       :sunset
       setting
       [{:message "The config app doesn't have the flags namespace set up."}]))
    ;; The lookup ref doubles as an upsert: it creates the entity with
    ;; `setting` set when it doesn't exist yet.
    (let [lookup [setting-attr-id setting]]
      (tx/transact! (aurora/conn-pool :write)
                    attrs
                    app-id
                    [[:add-triple lookup id-attr-id lookup]
                     [:add-triple lookup value-attr-id value]]))))

(defn set-stage!
  "Sets the global sunset stage: :none, :signups-closed, :read-only, or
   :disabled."
  [stage]
  (when-not (contains? (set flags/sunset-stages) stage)
    (ex/throw-validation-err!
     :sunset-stage
     stage
     [{:message (str "Stage must be one of: "
                     (string/join ", " (map name flags/sunset-stages))
                     ".")}]))
  (update-flag! "sunset-stage" (name stage))
  (when (= stage :read-only)
    (update-flag! "final-backup-status" "pending")))

(defn state
  "Current sunset state as seen by this machine's flag subscription."
  []
  {:stage (flags/sunset-stage)})

;; ----------
;; Billing

(defn billing-state
  "Summary of the active Stripe subscriptions and which Stripe
   environment the API key points at, for the intern dashboard."
  []
  (let [subs (stripe/subscriptions)
        remaining (remove :cancel-at-period-end subs)]
    {:stripe-mode (name (stripe/key-mode))
     :active-count (count subs)
     :already-scheduled-count (- (count subs) (count remaining))
     :remaining-count (count remaining)
     :remaining-monthly-revenue (double (reduce + 0 (map :monthly-revenue remaining)))}))

(defn cancel-all-subscriptions!
  "Schedules every active Stripe subscription to end at the close of its
   current billing period. Update-only: nothing on Stripe is canceled
   immediately or deleted, and re-running skips subscriptions that are
   already scheduled. The `sunset` cancel-reason makes the webhook skip
   the founders@ churn email when the deletions eventually arrive. Runs
   in the background; poll billing-state to watch it drain.

   Prod-only: outside prod this would sweep the shared test-mode Stripe
   account and schedule away other devs' test subscriptions. To try the
   machinery in dev, cancel a single throwaway subscription instead
   (see comment below)."
  []
  (when-not (config/prod?)
    (ex/throw-validation-err!
     :sunset
     :cancel-all-subscriptions
     [{:message (str "Refusing to sweep the shared test-mode Stripe account. "
                     "In dev, schedule-cancel a single throwaway subscription "
                     "from the REPL instead.")}]))
  (let [subs (stripe/subscriptions)
        remaining (remove :cancel-at-period-end subs)]
    (fut-bg
     (tracer/with-span! {:name "sunset/cancel-all-subscriptions"
                         :attributes {:count (count remaining)}}
       (doseq [{:keys [subscription-id]} remaining]
         (tracer/with-span! {:name "sunset/schedule-cancel-at-period-end"
                             :attributes {:subscription-id subscription-id}}
           (stripe/schedule-cancel-at-period-end!
            {:subscription-id subscription-id
             :metadata {"cancel-reason" "sunset"}})))))
    {:scheduling-count (count remaining)
     :already-scheduled-count (- (count subs) (count remaining))}))

(comment
  (billing-state)
  ;; Controlled dev test: schedule-cancel one subscription you created,
  ;; without touching anyone else's test subscriptions.
  (stripe/schedule-cancel-at-period-end!
   {:subscription-id "sub_..."
    :metadata {"cancel-reason" "sunset"}}))

(comment
  (state)
  (set-stage! :signups-closed)
  (set-stage! :read-only)
  (set-stage! :none))
