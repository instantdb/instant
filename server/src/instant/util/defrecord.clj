(ns instant.util.defrecord)

(def record-registry (atom {}))

(defmacro defrecord-once [name fields & body]
  (let [fingerprint (hash [fields body])
        registry-key [(ns-name *ns*) name]
        constructor (symbol (str "->" name))
        already-defined? (ns-resolve *ns* constructor)
        matches-last-known? (= (get @record-registry registry-key) fingerprint)]
    (if (and already-defined? matches-last-known?)
      nil
      (do
        (swap! record-registry assoc registry-key fingerprint)
        `(defrecord ~name ~fields ~@body)))))
