#!/bin/bash

set -x

file="/etc/deploy_count.txt"

touch "$file"
if [ ! -f "$file" ]; then
  echo "0" > "$file"
fi

read -r current_count < "$file"
new_count=$((current_count + 1))
echo "$new_count" > "$file"

hz_port=$((6001 + (new_count % 8)))

echo "HZ_PORT=$hz_port" > hazelcast.env
