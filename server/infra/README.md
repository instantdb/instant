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

The API sets `-Djdk.nio.maxCachedBufferSize=131072`. When NIO writes a heap
buffer to a socket, it copies the data into a temporary native buffer. Corretto
26 caches these buffers on long-lived platform/carrier threads without a size
limit by default. Undertow's gathering writes can leave many large buffers in
each IO thread's cache after the WebSocket messages finish. These buffers are
outside the Java heap and are excluded from the direct-buffer MXBean and
`MaxDirectMemorySize` accounting.

The 128 KiB cap applies to each cached buffer. It preserves reuse of ordinary
Java socket buffers while freeing larger temporary buffers after I/O. It does
not limit message sizes or the memory needed by writes in progress. The cache
can hold up to 1,024 entries per thread; this is not a process-wide native
memory limit. The property is read at NIO initialization, so changes require a
JVM restart.

Two September 28 hosts reached about 120.7 GiB RSS on 123.1 GiB machines while
heap pressure remained below 50%. Subsequent profiling identified repeated
34.6 MiB native allocations in `Util.getTemporaryDirectBuffer` during Undertow
WebSocket writes. A read-only cache census found 4.97 GiB retained on the
surviving host, including 4.96 GiB on its 32 IO threads. The newer host already
held 1.67 GiB. The failed processes were unavailable for a cache census, so
these measurements do not retrospectively assign every byte of their RSS.

The container also sets `-XX:TrimNativeHeapInterval=60000` with
`-Xlog:trimnative=info`. A dedicated JVM thread returns freed glibc pages to the
OS every minute and logs reclamation and duration. A previous trim reclaimed
4.6 GiB on the surviving process. This complements the cache cap: trimming
cannot reclaim buffers that the NIO cache still owns. Heap sizing remains in
`JAVA_OPTS`.

After rollout, observe host RSS and `MemAvailable`, trim duration, request and
reactivity latency, GC pressure, and large-message traffic through a full backup
cycle. Backpressured large writes can allocate/free temporary buffers repeatedly;
the cache cap therefore trades some allocation work for bounded retention.
Local socket tests establish payload correctness and memory reclamation, not
production latency bounds.

`JAVA_OPTS` follows these defaults, allowing an explicit override. To restore
the original NIO cache behavior, append
`-Djdk.nio.maxCachedBufferSize=9223372036854775807`. To disable trimming, append
`-XX:TrimNativeHeapInterval=0`. Roll the configuration and preserve the other JVM
options, including heap settings.

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
