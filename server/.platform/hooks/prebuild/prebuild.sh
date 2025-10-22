#!/bin/bash

set -x
set -e

# Update EB_ENV_NAME in the docker-compose.yml

sed -i "s/EB_ENV_NAME/$(/opt/elasticbeanstalk/bin/get-config container -k environment_name)/g" docker-compose.yml

###################
# Setup Hazelcast #
###################

# Rotates hazelcast port on each new deploy

file="/etc/deploy_count.txt"

if [ ! -f "$file" ]; then
  echo "0" > "$file"
fi

read -r current_count < "$file"
new_count=$((current_count + 1))
echo "$new_count" > "$file"

hz_port=$((5701 + (new_count % 8)))

echo "HZ_PORT=$hz_port" > hazelcast.env

#################
# Set up memory #
#################

# Use 81% of available memory for heap
heap_ratio="0.81"
# Put 95% of available memory in huge pages
huge_page_ratio="0.95"

# https://docs.redhat.com/en/documentation/red_hat_data_grid/7.1/html/performance_tuning_guide/configure_page_memory
huge_page_size=$(echo "2 * 1024 * 1024" | bc)

# Reserve at least 1 GB
reserved_mem=$(echo "1024^3" | bc)

avail_mem=$(awk '/MemTotal/ {print $2 * 1024}' /proc/meminfo)

heap=$(echo "scale=0; $avail_mem * $heap_ratio / 1" | bc)

# We'll take the min of mem_a or mem_b for huge pages, so that we reserve
# at least 1gb of memory
mem_a=$(echo "$avail_mem * $huge_page_ratio" | bc)
mem_b=$(echo "$avail_mem - $reserved_mem" | bc);

huge_page_mem=$(echo "define min(a,b){ if(a>b){return(b)}; return(a) }; min($mem_a, $mem_b)" | bc -l)

page_count=$(echo "scale=0; $huge_page_mem / $huge_page_size" | bc)

echo "$page_count" > /sys/kernel/mm/hugepages/hugepages-2048kB/nr_hugepages

echo "EXTRA_JAVA_OPTS=-Xmx$heap -Xms$heap" > java.env
