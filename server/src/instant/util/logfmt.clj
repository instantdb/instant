(ns instant.util.logfmt
  "Logfmt value escaping. The implementation lives in `instant.Logfmt` — a
   straight-Clojure version of the same algorithm consistently runs ~2.5×
   slower with ~10× more per-call allocation, because the inner char loop
   gets boxed through `==`/`or` despite type hints. The Java method has the
   simple bytecode the JIT actually inlines."
  (:import
   (instant Logfmt)))

(defn append-logfmt-string
  "Append `s` to `sb` as a logfmt value: bare if safe, else wrapped in
   `\"...\"` with `\\`, `\"`, `\\n`, `\\r`, `\\t` backslash-escaped. `nil` and
   empty strings emit as `\"\"`."
  [^StringBuilder sb ^String s]
  (Logfmt/appendLogfmtString sb s))

(defn append-logfmt-key
  "Append `key` to `sb`, rewriting any `.` as `_` so dotted OTel keys like
   `exception.type` become `exception_type` — plain identifiers in VRL /
   Athena / JSON tools."
  [^StringBuilder sb ^String key]
  (Logfmt/appendLogfmtKey sb key))
