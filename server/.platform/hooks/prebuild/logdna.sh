#!/bin/bash

# Generates a logdna.env file that will be picked up by docker-compose.yml and
# set up some logdna tags

envfile="/var/app/staging/logdna.env"

token=`curl -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 60"`

hostname=$(curl -H "X-aws-ec2-metadata-token: $token" http://169.254.169.254/latest/meta-data/hostname)
instance_id=$(curl -H "X-aws-ec2-metadata-token: $token" http://169.254.169.254/latest/meta-data/instance-id)
instance_type=$(curl -H "X-aws-ec2-metadata-token: $token" http://169.254.169.254/latest/meta-data/instance-type)
env_name=$(/opt/elasticbeanstalk/bin/get-config container -k environment_name)
git_sha="SHA_REPLACE_ME"

echo "MZ_HOSTNAME=${hostname}" > $envfile
echo "MZ_TAGS=${instance_id},${instance_type},${env_name},${git_sha}" >> $envfile
