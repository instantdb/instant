(ns hooks.nippy)

(defmacro extend-freeze
  [type type-id [x out] & body]
  `(let [~'_ ~type-id]
     (extend-type ~type taoensso.nippy/IFreezable1
                  (~'-freeze-without-meta! [~x ~out]
                   ~@body))))

(defmacro extend-thaw
  [type-id [in] & body]
  `(let [~in 1
         ~'_ ~type-id]
     ~@body))
