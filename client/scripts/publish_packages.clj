#!/usr/bin/env bb

(ns publish-packages
  (:require [clojure.string :as str]
            [babashka.process :as proc]
            [cheshire.core :as json]))

(def PACKAGE_PATHS {:version "./packages/version"
                    :core "./packages/core"
                    :admin "./packages/admin"
                    :react "./packages/react"
                    :react-native "./packages/react-native"
                    :cli "./packages/cli"
                    :platform "./packages/platform"
                    :mcp "./packages/mcp"})

(defn package-json-path [main]
  (str main "/package.json"))

(defn jq-set! [path k v]
  (spit path
        (:out (proc/sh "jq" (str k "=\"" v "\"") path))))

(defn has-dependency? [path dep]
  (get-in (json/parse-string (slurp path) false) ["dependencies" dep]))

(defn set-package-versions!
  "Update all package.jsons with the given version"
  [v]
  (doseq [[k path] PACKAGE_PATHS]
    (println (str  "[" (name k) "]" " set version = " v))
    (jq-set! (package-json-path path) ".version" v)))

(defn publish-packages! [tag]
  (println "[publish] pnpm publish-packages")
  (if tag
    (proc/shell "pnpm" "publish-packages" "--" "--tag" tag)
    (proc/shell "pnpm" "publish-packages")))

(defn get-version []
  (let [file "packages/version/src/version.ts"
        version (->> (slurp file)
                     (re-find #"const version = '(v\d+\.\d+\.\d+[^']*)'")
                     last)]
    (assert version (format "Could not version in %s file" file))
    version))

(defn -main [& args]
  (let [tag (first args)
        version (get-version)]
    (if tag
      (when (not (str/includes? version tag))
        (println (format "When publishing the `%s` tag, the version must contain the tag (e.g. v0.1.2-%s.0)."
                         tag tag))
        (println (format "You provided %s" version))
        (System/exit 1))
      (when (not (re-find #"^v\d+\.\d+\.\d+$" version))
        (println (format "Version should match format v0.1.2, but you provided %s"
                         version))
        (System/exit 1)))
    (set-package-versions! version)
    (publish-packages! tag)
    (set-package-versions! "0.0.0")))

(when (= *file* (System/getProperty "babashka.file"))
  (apply -main *command-line-args*))
