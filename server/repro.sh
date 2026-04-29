#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

scripts/nrepl-eval <<'EOF'
(do
  (println "starting pin repro")
  (require '[clojure.test :as t]
           '[instant.db.indexing-jobs-test :as test]
           :reload)
  (t/test-vars [#'instant.db.indexing-jobs-test/metadata-only-attr-updates-do-not-starve-virtual-thread-carriers])
  (println "finished pin repro"))
EOF
