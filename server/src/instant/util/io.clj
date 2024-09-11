(ns instant.util.io
  (:require [instant.util.tracer :as tracer]))

(def ^:dynamic *tracking-io* nil)

(defmacro warn-io [context & body]
  `(binding [*tracking-io* ~context]
     ~@body))

(defmacro tag-io [& body]
  (let [file *file*
        {:keys [line column]} (meta &form)]
  `(do
     (when *tracking-io*
       (tracer/record-info! {:name "warn-io"
                             :attributes {:context *tracking-io*
                                          :body '~body
                                          :file ~file
                                          :line ~line
                                          :column ~column}}))
     ~@body)))
