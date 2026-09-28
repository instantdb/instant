# JVM autoscaling

The API publishes heap pressure, GC pause pressure, and uptime every 30 seconds
on a dedicated thread with bounded AWS calls. Heap pressure uses the latest
collection's actual heap occupancy, falling back to current occupied heap when
that collection is over a minute old. Committed heap is not a pressure signal
with `-Xms90g -Xmx90g`. Invalid GC intervals are omitted rather than reported as
zero. The publisher refreshes its group tag every minute because immutable
platform updates can transfer a running instance between groups.

The Elastic Beanstalk bundle uses these scale-out alarms:

| Signal | Threshold | Breaching one-minute periods | Statistic |
| --- | --- | --- | --- |
| CPU | >70% | 2 of 2 | Average |
| Heap pressure | >75% | 2 of 2 | Maximum |
| GC pause pressure | >15% | 3 of 5 | Average |
| Severe GC pause pressure | >40% | 2 of 2 | Maximum |

Heap pressure and the severe GC alarm use the highest reported value across the
group; the GC pressure alarm averages every 30-second sample in the minute.
Routine load on one r6a.4xlarge produces individual GC samples above 10% many
times a day, so the GC alarms look for a sustained average or an outright
stall rather than one busy sample. With complete telemetry, the 3-of-5 rule
counts three breaching minutes, which need not be consecutive. With missing
samples, CloudWatch can evaluate older data and alarm after a breach followed
by gaps ([AWS behavior](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/alarms-and-missing-data.html)).
The alarms share the existing scale-up policy. Normal capacity is one to two
instances. Adding a spare does not free a leaking JVM's heap; application health
checks still handle sustained unresponsiveness.

`jvm_autoscaling.yaml` checks scale-in once per minute. Over the last fifteen
complete minutes it requires average CPU below 30%, each JVM's average GC
pressure below 6%, each JVM up for at least an hour, and the sum of the JVMs'
median heap pressure below 80%, assuming equal 90 GiB heap limits. One JVM
serving the whole workload has held well under the sum of both heaps because
each JVM caches the same data, so summing medians is already conservative.
Missing or stale data, restarts, unhealthy instances, deployments, a red
environment, and changing membership prevent scale-in. A yellow environment
does not: it reports one impacted instance for much of the day without a
request-level cause, and the group's ELB health check already replaces
instances that fail.

## Native memory

The API container enables `-XX:TrimNativeHeapInterval=60000` on Corretto 26
with glibc. A dedicated JVM thread periodically returns free native allocator
pages to the OS. This does not collect the Java heap or reclaim live native
allocations. `-Xlog:trimnative=info` records the reclaimed memory and trim
duration. Heap sizing still comes from `JAVA_OPTS`.

On September 28, two successive hosts reached about 120.7 GiB RSS on a
123.1 GiB machine before becoming unresponsive. Available memory fell to roughly
100 MiB, while the last heap-pressure readings were below 50%. Both stalls
coincided with sustained root-disk reads at 125 MiB/s. Heap and GC alarms do not
cover this host-memory failure. A later native trim on the surviving process
returned about 4.6 GiB without restarting Java, confirming that freed allocator
pages can consume substantial headroom.

After a rollout, check trim reclamation and duration alongside host
`MemAvailable`, memory pressure, request latency, and completion of the scheduled
backup. Trimming can contend with native allocations, and it cannot bound live
native memory growth. The allocation owner must be measured if the process
continues growing after freed pages have been returned.

To disable periodic trimming, append `-XX:TrimNativeHeapInterval=0` to the
existing `JAVA_OPTS` and roll the configuration. The environment options follow
the container defaults, so they take precedence. Preserve the heap settings
when rolling back only trimming.

## Deployment

The controller invokes the full down-policy ARN with cooldown; IAM restricts
execution to the exact group ARN. The old low-CPU alarms have no direct scaling
actions, so a missing controller keeps extra capacity running.

Deploy the API bundle, then run from `server`:

```sh
bb scripts/deploy_jvm_autoscaling.clj Instant-docker-prod-env-2
```

The helper resolves the current group and policy, then deploys a separate
CloudFormation stack. This keeps Lambda and IAM management out of Elastic
Beanstalk's managed-update role. Run it again when changing the controller or
replacing the bound group/policy. Check that every current instance publishes
metrics, the alarms evaluate normally, and controller logs explain withheld
scale-in decisions.
