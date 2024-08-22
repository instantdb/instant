#!/usr/bin/env bash

set -euxo pipefail

sha=$(git rev-parse HEAD)
tag="$sha-$(hostname)"

aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 597134865416.dkr.ecr.us-east-1.amazonaws.com

docker buildx build --platform linux/amd64 -t 597134865416.dkr.ecr.us-east-1.amazonaws.com/instant-prod-ecr:$tag .

docker push 597134865416.dkr.ecr.us-east-1.amazonaws.com/instant-prod-ecr:$tag

sed -i '' "s|IMAGE_REPLACE_ME|597134865416.dkr.ecr.us-east-1.amazonaws.com/instant-prod-ecr:${tag}|g" docker-compose.yml

sed -i '' "s|SHA_REPLACE_ME|${tag}|g" .platform/hooks/prebuild/logdna.sh

application_version="app-manual-${tag}"
file="${application_version}.zip"

zip $file docker-compose.yml .platform/hooks/prebuild/logdna.sh

bucket=elasticbeanstalk-us-east-1-597134865416
key="instant-docker-prod/$file"

aws s3api put-object --region us-east-1 --bucket "$bucket" --key "$key" --body $file

aws elasticbeanstalk create-application-version --region us-east-1 --application-name instant-docker-prod --version-label "$application_version" --description "Manual deploy from $(hostname)" --source-bundle "S3Bucket=$bucket,S3Key=$key"

eb deploy instant-docker-prod-env --version "$application_version"
