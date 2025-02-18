(ns instant.db.model.triple-cols)

;; Prevent a circular-dependency since attr-model needs these
(def triple-cols
  [:app-id :entity-id :attr-id :value :value-md5 :ea :eav :av :ave :vae :checked-data-type])
