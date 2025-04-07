(ns instant.comment)

(defn zeneca-app!
  []
  (let [{:keys [id] :as z} (instant.dash.ephemeral-app/create! {:title "c-zeneca"})]
    (instant.data.bootstrap/add-zeneca-to-app! id)
    z))

(defn empty-app!
  []
  (instant.dash.ephemeral-app/create! {:title "c-empty-app"}))
