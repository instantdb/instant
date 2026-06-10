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

# Update EB_ENV_NAME in the docker-compose.yml and vector.yaml

eb_env_name=$(/opt/elasticbeanstalk/bin/get-config container -k environment_name)
sed -i "s/EB_ENV_NAME/$eb_env_name/g" docker-compose.yml
sed -i "s/EB_ENV_NAME/$eb_env_name/g" vector.yaml

# Fetch the EC2 instance ID from IMDSv2 and write to vector.env. Vector reads
# this via env_file and references INSTANCE_ID through get_env_var in its
# remap, decorating every event with .instance_id.

imds_token=$(curl -sX PUT -H "X-aws-ec2-metadata-token-ttl-seconds: 60" http://169.254.169.254/latest/api/token)
instance_id=$(curl -sH "X-aws-ec2-metadata-token: $imds_token" http://169.254.169.254/latest/meta-data/instance-id)
echo "INSTANCE_ID=$instance_id" > vector.env
