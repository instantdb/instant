(ns instant.util.defrecord)

(defonce record-registry (atom {}))

(defmacro defrecord-once [name fields & body]
  (let [fingerprint (hash [fields body])
        constructor (symbol (str "->" name))
        ;; We check the state of the compiler's namespace RIGHT NOW
        already-defined? (resolve constructor)
        matches-last-known? (= (get @record-registry name) fingerprint)]

    (if (and already-defined? matches-last-known?)
      ;; Expand to nothing. The compiler stops here.
      nil

      ;; Otherwise, update the registry and expand to a full defrecord
      (do
        (swap! record-registry assoc name fingerprint)
        `(defrecord ~name ~fields ~@body)))))
