instance_id=$(
  aws ec2 describe-instances \
    --filter "Name=tag:elasticbeanstalk:environment-name,Values=Instant-docker-prod-env" \
    --query "Reservations[].Instances[?State.Name == 'running'].InstanceId[]" \
    --output text
)

echo "Opening SSH connection to $instance_id"

aws ssm start-session \
    --target "$instance_id" \
    --region "us-east-1"