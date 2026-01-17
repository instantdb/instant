(ns instant.util.exception-test
  (:require [instant.util.exception :as ex]
            [clojure.test :refer [deftest is]]))

(deftest parse-unique-detail
  (is (= (ex/parse-unique-detail "Key (app_id, attr_id, json_null_to_null(value))=(7c7625f7-6eb3-4470-b745-fd28e006cbe9, 55ac8990-86e1-4e20-98fb-ca70fe8bbaae, \"d\") already exists.")
         {"app_id" "7c7625f7-6eb3-4470-b745-fd28e006cbe9"
          "attr_id" "55ac8990-86e1-4e20-98fb-ca70fe8bbaae"
          "json_null_to_null(value)" "\"d\""}))

  (is (= (ex/parse-unique-detail  "Key (app_id, attr_id, json_null_to_null(value))=(7c7625f7-6eb3-4470-b745-fd28e006cbe9, 55ac8990-86e1-4e20-98fb-ca70fe8bbaae, \"{\\\"hello\\\": \\\"worl,d\\\", \\\"testing\\\": \\\"this\\\"}\") already exists.")
         {"app_id" "7c7625f7-6eb3-4470-b745-fd28e006cbe9"
          "attr_id" "55ac8990-86e1-4e20-98fb-ca70fe8bbaae"
          "json_null_to_null(value)" "\"{\\\"hello\\\": \\\"worl,d\\\", \\\"testing\\\": \\\"this\\\"}\""})))
