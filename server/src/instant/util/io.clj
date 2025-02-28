(ns instant.util.io
  (:require [instant.util.tracer :as tracer]))

(def ^:dynamic *tracking-io* nil)
(def ^:dynamic *tap-io* nil)

(defmacro warn-io
  "Wrap a body with `warn-io` when you want to get a honeycomb trace if any
   functions wrapped with `tag-io` are called in the body.
   Useful for finding places where we're not prefetching enough data."
  [context & body]
  `(binding [*tracking-io* ~context]
     ~@body))

(defmacro tag-io
  "Wrap a body with `tag-io` if it does i/o and should log a warning inside of
   a body wrapped with `warn-io`."
  [& body]
  (let [file *file*
        {:keys [line column]} (meta &form)]
    `(do
       (when *tracking-io*
         (when *tap-io*
           (*tap-io* {:context *tracking-io*
                      :file ~file
                      :line ~line
                      :column ~column}))
         (tracer/record-info! {:name "warn-io"
                               :attributes {:context *tracking-io*
                                            :body '~body
                                            :file ~file
                                            :line ~line
                                            :column ~column}}))
       ~@body)))
