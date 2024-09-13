#!/bin/bash
# set -x
# set -e

port=6005  # Default port

while [[ "$#" -gt 0 ]]; do
  case $1 in
    --instance-id) instance_id="$2"; shift ;;
    --port) port="$2"; shift ;;
    *) echo "Unknown parameter passed: $1"; exit 1 ;;
  esac
  shift
done

if [ -z "$instance_id" ]; then
  instance_id=$(
    aws ec2 describe-instances \
      --filter "Name=tag:elasticbeanstalk:environment-name,Values=Instant-docker-prod-env" \
      --query "Reservations[].Instances[?State.Name == 'running'].InstanceId[]" \
      --output text
  )
fi

echo "Setting up tunnel to $instance_id on port $port"

echo "$port" > .nrepl-port

aws ssm start-session \
    --document-name "AWS-StartPortForwardingSession" \
    --target "$instance_id" \
    --parameters "{\"portNumber\":[\"6005\"],\"localPortNumber\":[\"$port\"]}" \
    --region "us-east-1"

rm .nrepl-port

echo "Tunnel closed"
