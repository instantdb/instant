#!/usr/bin/env bash

set -euo pipefail

cluster_id='instant-aurora-8'

cluster_info=$(aws rds describe-db-clusters --db-cluster-identifier $cluster_id --query 'DBClusters[0].{host: Endpoint, port: Port, secretArn: MasterUserSecret.SecretArn, dbname: DatabaseName}')

host=$(jq -r '.host' <<< $cluster_info)
secret_arn=$(jq -r '.secretArn' <<< $cluster_info)
port=$(jq -r '.port' <<< $cluster_info)
dbname=$(jq -r '.dbname' <<< $cluster_info)

secret_info=$(aws secretsmanager get-secret-value --secret-id $secret_arn --query 'SecretString' --output text)

username=$(jq -r '.username' <<< $secret_info)
password=$(jq -r '.password | @uri' <<< $secret_info)

echo "postgresql://$username:$password@$host:$port/$dbname"
