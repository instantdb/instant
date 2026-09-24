# Host stall diagnostics

`host_diagnostics.py` samples Linux procfs every five seconds in a separate systemd service. It records available memory, reclaim and fault counters, memory/I/O pressure, whole-device disk counters, and selected processes' disk reads, faults, CPU and RSS. Java and Vector cgroup counters cover their complete containers. Process identity includes start time so PID reuse does not create false rates. Arguments, environment variables and file contents are not collected.

The service caps memory at 64 MiB and CPU at 5% of one core. Its log rotates across three files of at most 5 MiB each. CloudWatch Agent sends the current file directly, independently of the application and Vector, with a five-second flush interval. A second source preserves kernel messages, including OOM and blocked-task reports. Both groups retain 14 days:

```
/aws/elasticbeanstalk/<environment>/host-diagnostics
/aws/elasticbeanstalk/<environment>/host-kernel
```

Each log stream is named after the instance ID. The JSON `timestamp`, boot ID and monotonic interval make gaps visible. A host or network failure can still lose unshipped samples; this is not a guarantee that the final five seconds survive.

## Installation and verification

The application and configuration postdeploy hooks invoke `scripts/install_host_diagnostics.sh`. It installs the service and appends only its own CloudWatch configuration, preserving Beanstalk's log sources. It restarts the sampler when its code/unit changes and reloads CloudWatch only when its source changes. It does not restart Java or Vector. The CI bundle allowlist includes both scripts and hooks.

If installation fails, the hooks log an error and allow the application deployment to continue. Check off-host delivery after deployment and rerun the installer to repair collection. Running the installer directly still returns a failure status.

The same installer can run on an existing host, with an explicit environment name, without an application deployment:

```sh
sudo bash scripts/install_host_diagnostics.sh Instant-docker-prod-env-2
sudo systemctl status instant-host-diagnostics.service
sudo journalctl -u instant-host-diagnostics.service -n 20 --no-pager
```

Verify actual off-host delivery, not just an active service:

```sh
aws logs tail /aws/elasticbeanstalk/Instant-docker-prod-env-2/host-diagnostics --region us-east-1 --since 5m --format short
```

Kernel collection uses Beanstalk's rsyslog service and `/var/log/messages`, verified on the Docker AL2023 platform. On replacement hosts or platform upgrades, also verify `rsyslog.service` is active and kernel records reach `host-kernel`. Historical kernel records carry their original time inside the message; CloudWatch timestamps reflect collection time.

A separately managed SSM bootstrap may bridge replacement hosts until a release containing the hooks is deployed. It must use an existing `/opt/instant/install_host_diagnostics.sh` when present, so an older bootstrap never overwrites newer deployed code. Its interval is at least 30 minutes; bootstrap coverage is not instantaneous. Remove that association once all deployed release bundles contain these hooks.

## Using the evidence

Compare the same instance and UTC window with request latency, `Instant/JVM` metrics and archived backup spans. No database polling is added. A completed upload span identifies successful work; an absence of completed spans does not mean no uploads were in flight.

- Memory pressure: falling `memory_bytes.MemAvailable`, rising memory PSI totals, `allocstall`/`pgscan`/`pgsteal` and file refaults, plus major faults and disk reads. This supports reclaim-driven thrashing when it precedes the stall.
- A disk reader: rising process `delta.read_bytes` with healthy available memory and little reclaim. Identify its PID/start time, `comm` and cgroup. `read_total` selection has no preceding sample, so its cumulative bytes are not a measured rate.
- A JVM/container issue: compare Java RSS/RssAnon and container `memory_stat` with the existing heap metrics. Native retention needs further attribution; RSS alone does not identify an allocator leak.
- A kernel failure: examine `host-kernel` for OOM kills, hung tasks and device errors, with host/cgroup OOM counters as supporting evidence.

Disk sectors are always 512 bytes. Process, cgroup and disk counters overlap and must not be added together. Missing counters are omitted and counted in `errors`. Top-process selection is bounded at 25; short-lived processes can start and exit between samples. Process state/wchan describes the thread-group leader, while PSI and `procs_blocked` describe aggregate stalls.

Require a complete, restorable backup and healthy concurrent request traffic when validating any prevention change against the identified failure.

## Tests and rollback

```sh
python3 -m unittest discover -s scripts/tests -p 'test_host_diagnostics.py'
```

To stop diagnostics, first remove any bootstrap association so it does not reinstall them, then disable the service and remove only its CloudWatch source:

```sh
sudo systemctl disable --now instant-host-diagnostics.service
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a remove-config -m ec2 -s -c file:/etc/instant/instant-host-diagnostics.json
```

Remove the hooks from the next release if stopping collection permanently. Existing off-host logs retain their configured lifetime.
