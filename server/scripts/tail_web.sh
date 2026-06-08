#!/bin/bash
set -e

env_name="Instant-docker-prod-env-2"
tap="parse_logs"

while [[ "$#" -gt 0 ]]; do
  case $1 in
    --instance-id) instance_id="$2"; shift ;;
    --tap) tap="$2"; shift ;;
    --env) env_name="$2"; shift ;;
    *) echo "Unknown parameter: $1"; exit 1 ;;
  esac
  shift
done

if [ -z "$instance_id" ]; then
  instances=$(aws ec2 describe-instances \
    --filter "Name=tag:elasticbeanstalk:environment-name,Values=$env_name" \
    --query "Reservations[].Instances[?State.Name == 'running'].[InstanceId, PrivateIpAddress, LaunchTime]" \
    --output text)

  if [ -z "$instances" ]; then
    echo "No running instances found in $env_name"
    exit 1
  fi

  echo "Running instances in $env_name:"
  echo "$instances" | awk '{ printf "  %d) %s  ip=%s  launched=%s\n", NR, $1, $2, $3 }'
  printf "Select instance [1]: "
  read choice
  choice=${choice:-1}
  instance_id=$(echo "$instances" | awk -v n="$choice" 'NR==n { print $1 }')

  if [ -z "$instance_id" ]; then
    echo "Invalid selection"
    exit 1
  fi
fi

echo "Tapping $tap on $instance_id..."

# Strip docker_logs metadata and our injected instance_id from the streaming
# logfmt output. None of these field values contain spaces, so a single
# unquoted-value regex covers them.
strip_re='s/(container_id|container_name|container_created_at|host|image|instance_id|stream|label\.[^=[:space:]]+)=[^ ]+ ?//g'

remote_cmd="sudo docker exec \$(sudo docker ps -q --filter label=com.docker.compose.service=vector) vector tap --format logfmt $tap | sed -uE '$strip_re'"

# Use JSON form for --parameters so the inline single quotes don't confuse the
# AWS CLI's `key=value` shorthand parser.
params=$(jq -nc --arg cmd "$remote_cmd" '{command: [$cmd]}')

aws ssm start-session \
  --target "$instance_id" \
  --region "us-east-1" \
  --document-name AWS-StartInteractiveCommand \
  --parameters "$params"
