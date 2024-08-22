#!/bin/bash
# set -x
# set -e

instance_id=$(
  aws ec2 describe-instances \
    --filter "Name=tag:elasticbeanstalk:environment-name,Values=Instant-docker-prod-env" \
    --query "Reservations[].Instances[?State.Name == 'running'].InstanceId[]" \
    --output text
)
port=6005

echo "Setting up tunnel to $instance_id on port $port"

echo "6005" > .nrepl-port

aws ssm start-session \
    --document-name "AWS-StartPortForwardingSession" \
    --target "$instance_id" \
    --parameters '{"portNumber":["6005"],"localPortNumber":["6005"]}' \
    --region "us-east-1"

rm .nrepl-port

echo "Tunnel closed"
