#!/bin/bash
# set -x
# set -e

remote_port=8193
local_port=8193  # Default port

while [[ "$#" -gt 0 ]]; do
  case $1 in
    --instance-id) instance_id="$2"; shift ;;
    --local-port) local_port="$2"; shift ;;
    --remote-port) remote_port="$2"; shift ;;
    *) echo "Unknown parameter passed: $1"; exit 1 ;;
  esac
  shift
done

if [ -z "$instance_id" ]; then
  instance_id=$(
    aws ec2 describe-instances \
      --filter "Name=tag:elasticbeanstalk:environment-name,Values=Instant-docker-prod-env-2" \
      --query "Reservations[].Instances[?State.Name == 'running'].InstanceId[]" \
      --output text
  )
fi

echo "Setting up tunnel to $instance_id on port $local_port to remote port $remote_port"

aws ssm start-session \
    --document-name "AWS-StartPortForwardingSession" \
    --target "$instance_id" \
    --parameters "{\"portNumber\":[\"$remote_port\"],\"localPortNumber\":[\"$local_port\"]}" \
    --region "us-east-1"

echo "Tunnel closed"
