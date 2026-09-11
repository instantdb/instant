# JVM autoscaling

The API publishes occupied heap and GC pause metrics every 30 seconds to
`Instant/JVM`. Heap pressure uses the latest collection's actual heap usage; when
that collection is over a minute old, it uses current occupied heap instead.
Committed heap is not a pressure signal with `-Xms90g -Xmx90g`.
The publisher refreshes its group tag every minute because immutable platform
updates transfer running instances between groups.

The Elastic Beanstalk bundle installs 2-of-2 one-minute Maximum alarms for
heap pressure above 80% and GC pause time above 20%, using the highest reported
JVM value. With complete telemetry, both consecutive minute maxima must breach;
recurring bursts can qualify without continuous pressure. With missing samples,
CloudWatch can evaluate older data and alarm after a breach followed by gaps
([AWS behavior](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/alarms-and-missing-data.html)).
CPU scale-out remains above 70% for two minutes. Normal capacity remains one to two
instances. These starting thresholds were exercised with local G1 workloads;
they are not a guarantee of warning before every sudden failure.

`jvm_autoscaling.yaml` runs a scale-in check once per minute. It requires fifteen
complete minutes of CPU below 30%, each JVM's GC time below 5%, and combined heap
pressure below 70%. The combined budget assumes the current equal 90 GiB heap
limits and conservatively allows the workload to fit on one JVM. Missing data,
restarts, unhealthy instances, deployments, and changing membership prevent scale-in. Recent
pressure is checked too, including partially reported minutes. The evaluator can
invoke the configured scale-down policy, honoring its cooldown. AWS scopes
`ExecutePolicy` permission to the exact group ARN; the code fixes which policy
it invokes.

Deploy the API bundle, then run from `server`:

```sh
bb scripts/deploy_jvm_autoscaling.clj Instant-docker-prod-env-2
```

The script resolves the exact current group and policy, then deploys a separate
CloudFormation stack. Keeping the controller separate avoids adding Lambda and
IAM resource-management permissions to the Elastic Beanstalk managed-update
role. Run the script again when changing the controller or replacing the
environment's group/policy. The stack outputs record both bound resources.

Check that the metrics arrive for every current instance, the two new alarms
evaluate normally, and the controller's logs explain any withheld scale-in.
The old low-CPU alarms deliberately have no direct scaling actions. A missing
controller leaves extra capacity running rather than allowing CPU alone to
remove a memory-triggered spare. Adding capacity does not free a leaking heap;
application health checks still provide replacement after unresponsiveness.
