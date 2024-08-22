(ns instant.test-core
  (:require [circleci.test]))

(defn -main [& _args]
  (circleci.test/dir (str ["test"])))
