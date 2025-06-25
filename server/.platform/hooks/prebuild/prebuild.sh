#!/bin/bash

set -x

# Rotate Hazelcast port on every deploy

file="/etc/deploy_count.txt"

touch "$file"
if [ ! -f "$file" ]; then
  echo "0" > "$file"
fi

read -r current_count < "$file"
new_count=$((current_count + 1))
echo "$new_count" > "$file"

hz_port=$((5701 + (new_count % 8)))

echo "HZ_PORT=$hz_port" > hazelcast.env

# Update EB_ENV_NAME in the docker-compose.yml

sed -i "s/EB_ENV_NAME/$(/opt/elasticbeanstalk/bin/get-config container -k environment_name)/g" docker-compose.yml
