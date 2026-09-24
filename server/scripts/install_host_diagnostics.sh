#!/bin/bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
environment_name=${1:-$(/opt/elasticbeanstalk/bin/get-config container -k environment_name)}
[[ "$environment_name" =~ ^[a-zA-Z0-9_-]+$ ]]
agent_dir=/opt/aws/amazon-cloudwatch-agent
test -x "$agent_dir/bin/amazon-cloudwatch-agent-ctl"
/usr/bin/python3 -c 'import ast, pathlib, sys; ast.parse(pathlib.Path(sys.argv[1]).read_text())' "$script_dir/host_diagnostics.py"

same_file() {
  /usr/bin/python3 - "$1" "$2" <<'PY'
import pathlib, sys
source, destination = map(pathlib.Path, sys.argv[1:])
sys.exit(0 if destination.is_file() and source.read_bytes() == destination.read_bytes() else 1)
PY
}

tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT
install -d -m 0755 /opt/instant /etc/instant
install -d -m 0750 /var/log/instant
if ! same_file "$script_dir/install_host_diagnostics.sh" /opt/instant/install_host_diagnostics.sh; then
  install -m 0644 "$script_dir/install_host_diagnostics.sh" /opt/instant/install_host_diagnostics.sh
fi

cat > "$tmp_dir/instant-host-diagnostics.service" <<'UNIT'
[Unit]
Description=Instant host memory and disk diagnostics
After=local-fs.target

[Service]
ExecStart=/usr/bin/python3 /opt/instant/host_diagnostics.py --output /var/log/instant/host-diagnostics.jsonl
Restart=always
RestartSec=5
TimeoutStopSec=5
MemoryMax=64M
CPUQuota=5%
Nice=10
OOMScoreAdjust=-500
LimitNOFILE=256
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/log/instant

[Install]
WantedBy=multi-user.target
UNIT

changed=false
if ! same_file "$script_dir/host_diagnostics.py" /opt/instant/host_diagnostics.py; then
  install -m 0644 "$script_dir/host_diagnostics.py" /opt/instant/host_diagnostics.py
  changed=true
fi
if ! same_file "$tmp_dir/instant-host-diagnostics.service" /etc/systemd/system/instant-host-diagnostics.service; then
  install -m 0644 "$tmp_dir/instant-host-diagnostics.service" /etc/systemd/system/instant-host-diagnostics.service
  systemctl daemon-reload
  changed=true
fi
systemctl enable instant-host-diagnostics.service
if "$changed" || ! systemctl is-active --quiet instant-host-diagnostics.service; then
  systemctl restart instant-host-diagnostics.service
fi

cat > "$tmp_dir/instant-host-diagnostics.json" <<JSON
{
  "logs": {
    "force_flush_interval": 5,
    "logs_collected": {
      "files": {
        "collect_list": [{
          "file_path": "/var/log/instant/host-diagnostics.jsonl",
          "log_group_name": "/aws/elasticbeanstalk/$environment_name/host-diagnostics",
          "log_stream_name": "{instance_id}",
          "retention_in_days": 14
        }, {
          "file_path": "/var/log/messages",
          "log_group_name": "/aws/elasticbeanstalk/$environment_name/host-kernel",
          "log_stream_name": "{instance_id}",
          "retention_in_days": 14,
          "filters": [{"type": "include", "expression": "kernel:"}]
        }]
      }
    }
  }
}
JSON
install -m 0644 "$tmp_dir/instant-host-diagnostics.json" /etc/instant/instant-host-diagnostics.json
# Append preserves Beanstalk's other log sources. Reusing this file name updates
# only our source, and an unchanged install avoids restarting the agent.
if ! same_file /etc/instant/instant-host-diagnostics.json "$agent_dir/etc/amazon-cloudwatch-agent.d/file_instant-host-diagnostics.json"; then
  "$agent_dir/bin/amazon-cloudwatch-agent-ctl" -a append-config -m ec2 -s -c file:/etc/instant/instant-host-diagnostics.json
elif ! systemctl is-active --quiet amazon-cloudwatch-agent.service; then
  systemctl start amazon-cloudwatch-agent.service
fi
systemctl is-active --quiet instant-host-diagnostics.service
systemctl is-active --quiet amazon-cloudwatch-agent.service
