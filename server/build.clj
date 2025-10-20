(ns build
  (:require [clojure.tools.build.api :as b]))

(def class-dir "target/classes")
(def uber-file "target/instant-standalone.jar")

;; delay to defer side effects (artifact downloads)
(def basis (delay (b/create-basis {:project "deps.edn"})))

(defn compile-java [_]
  ;; First build the socketutil directory because instant.jdbc.socket-track
  ;; depends on it
  (b/javac {:src-dirs ["src/java/instant/socketutil"]
            :class-dir "target/classes"
            :basis @basis
            :javac-opts ["-proc:none"]})
  ;; Then build socket-track because instant.SocketWrapper depends on it
  (b/compile-clj {:basis @basis
                  :ns-compile '[instant.jdbc.socket-track]
                  :class-dir "target/classes"})
  ;; Now we can build the rest of the java files
  (b/javac {:src-dirs ["src/java"]
            :class-dir "target/classes"
            :basis @basis
            :javac-opts ["-proc:none"]}))

(defn dev [_]
  (compile-java nil)
  (b/process
   (b/java-command {:basis (b/create-basis {:project "deps.edn"
                                            :aliases [:dev]})
                    :main 'clojure.main
                    :main-args ["-m" "instant.core"]})))

(defn run [_]
  (compile-java nil)
  (b/process
   (b/java-command {:basis (b/create-basis {:project "deps.edn"})
                    :main 'clojure.main
                    :main-args ["-m" "instant.core"]})))

(defn clean [_]
  (b/delete {:path "target"}))

(defn uber [_]
  (clean nil)
  (compile-java nil)
  (b/copy-dir {:src-dirs ["src" "resources" "data"]
               :target-dir class-dir})
  (b/compile-clj {:basis @basis
                  :ns-compile '[instant.core]
                  :class-dir class-dir})
  (b/uber {:class-dir class-dir
           :uber-file uber-file
           :basis @basis
           :main 'instant.core
           :exclude [#"META-INF/license.*"]}))
