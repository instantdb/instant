(ns instant.comment)

(defn zeneca-app!
  []
  (let [{:keys [id] :as z} ((resolve 'instant.dash.ephemeral-app/create!)
                            {:title "c-zeneca"})]
    ((resolve 'instant.data.bootstrap/add-zeneca-to-app!) id)
    z))

(defn empty-app!
  []
  ((resolve 'instant.dash.ephemeral-app/create!) {:title "c-empty-app"}))
