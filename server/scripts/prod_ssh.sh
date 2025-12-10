while [[ "$#" -gt 0 ]]; do
  case $1 in
    --instance-id) instance_id="$2"; shift ;;
    *) echo "Unknown parameter passed: $1"; exit 1 ;;
  esac
  shift
done

if [ -z "$instance_id" ]; then
  instance_id=$(
    aws ec2 describe-instances \
      --filter "Name=tag:elasticbeanstalk:environment-name,Values=Instant-docker-prod-env-2" \
      --query "Reservations[].Instances[?State.Name == 'running'].InstanceId[] | [0]" \
      --output text
  )
fi

echo "Opening SSH connection to $instance_id"

aws ssm start-session \
    --target "$instance_id" \
    --region "us-east-1"
