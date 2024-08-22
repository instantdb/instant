#!/usr/bin/env bash

set -euo pipefail

aws secretsmanager get-secret-value --secret-id instant-aurora-1-pass --query 'SecretString' --output text | jq -r '"postgresql://\(.username):\(.password)@\(.host):\(.port)/instant"'
