#!/bin/bash
set -euo pipefail
app_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd)
if ! bash "$app_root/scripts/install_host_diagnostics.sh"; then
  echo "Host diagnostics installation failed; continuing deployment." >&2
fi
