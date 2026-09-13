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
| GC pause pressure | >10% | 3 of 5 | Maximum |
| Severe GC pause pressure | >15% | 2 of 2 | Maximum |

The JVM alarms use the highest reported value across the group. With complete
telemetry, the GC 3-of-5 rule counts three breaching minute maxima, which need not
be consecutive. These signals can respond to recurring bursts without
continuous pressure; they do not bound individual pause duration. With missing
samples, CloudWatch can evaluate older data and alarm after a breach followed
by gaps ([AWS behavior](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/alarms-and-missing-data.html)).
The alarms share the existing scale-up policy. Normal capacity is one to two
instances. Adding a spare does not free a leaking JVM's heap; application health
checks still handle sustained unresponsiveness.

`jvm_autoscaling.yaml` checks scale-in once per minute. It requires fifteen
complete minutes of CPU below 30%, each JVM's GC pressure below 5%, and combined
heap pressure below 70%, assuming equal 90 GiB heap limits. Missing or stale
data, restarts, unhealthy instances, deployments, and changing membership
prevent scale-in. Recent partial-minute pressure is checked too.

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
