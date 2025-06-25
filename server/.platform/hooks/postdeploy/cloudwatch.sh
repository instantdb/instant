#!/bin/bash

set -x

# We log the container logs directly from docker container with the
# awslogs driver in the docker-compose.yml.

sed -i 's/\*stdouterr.log/nonexistent.log/g' /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.d/file_beanstalk.json

systemctl restart amazon-cloudwatch-agent.service
