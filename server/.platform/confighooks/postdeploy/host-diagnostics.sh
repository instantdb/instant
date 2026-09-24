#!/bin/bash
set -euo pipefail
app_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd)
exec bash "$app_root/scripts/install_host_diagnostics.sh"
