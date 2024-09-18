#!/usr/bin/env bb

(ns publish-packages
  (:require [clojure.string :as str]
            [babashka.process :as proc]
            [cheshire.core :as json]))

(def PACKAGE_PATHS {:core "./packages/core"
                    :admin "./packages/admin"
                    :react "./packages/react"
                    :react-native "./packages/react-native"
                    :cli "./packages/cli"})

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

(defn set-dep-versions!
  "Some packages depend on @instantdb/*.

   In a monorepo, we use \"workspace:*\" to refer to the
   local version. Buut, we can't publish packages this way.

   Before we publish, we need to change worspace:* to the
   actual version.

   This function replaces deps that require `@instantdb/*`
   with the given version."
  [v]
  (doseq [[pkg path] (dissoc PACKAGE_PATHS :core)
          [dep-pkg _path] (dissoc PACKAGE_PATHS pkg)
          :when (has-dependency? (package-json-path path)
                                 (str "@instantdb/" (name dep-pkg)))]
    (println (format "[%s] set @instantdb/%s = %s"
                     (name pkg)
                     (name dep-pkg)
                     v))
    (jq-set! (package-json-path path)
             (format ".dependencies[\"@instantdb/%s\"]"
                     (name dep-pkg))
             v)))

(defn publish-packages! [tag]
  (println "[publish] pnpm publish-packages")
  (if tag
    (proc/shell "pnpm" "publish-packages" "--" "--tag" tag)
    (proc/shell "pnpm" "publish-packages")))

(defn -main [& _args]
  (let [tag (first _args)
        version (str/trim (slurp "version.md"))]
    (set-package-versions! version)
    (set-dep-versions! version)
    (publish-packages! tag)
    (set-dep-versions! "workspace:*")))

(when (= *file* (System/getProperty "babashka.file"))
  (apply -main *command-line-args*))
