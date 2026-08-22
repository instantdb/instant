---
nextjs:
  metadata:
    title: 'Self Hosting Instant on Railway'
    description: 'Deploy Instant with a one-click Railway template.'
---

The quickest way to self-host Instant is the [Railway one-click
template](https://railway.com/deploy/instantdb). It provisions a full Instant
deployment—backend, dashboard, PostgreSQL, and object storage—in a single
Railway project, so you can go from zero to a working instance without
provisioning servers yourself.

## What gets deployed

The template creates four resources:

- **`server`**: The Instant backend API, running
  [`ghcr.io/instantdb/server:latest`](https://github.com/instantdb/instant/pkgs/container/server).
- **`dashboard`**: The Instant dashboard UI, running
  `ghcr.io/instantdb/dashboard:latest`.
- **`postgres`**: PostgreSQL with the settings and extensions Instant needs,
  including `pg_hint_plan`.
- **`instantdb-storage`**: A [Railway Bucket](https://docs.railway.com/storage-buckets)
  that provides S3-compatible object storage for Instant Storage.

The template wires everything together with reference variables. The server
receives `DATABASE_URL` from Postgres plus `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, and
`S3_BUCKET` from the bucket, so you don't have to copy credentials around.

## Deploy the template

Open [railway.com/deploy/instantdb](https://railway.com/deploy/instantdb) and
click **Deploy Now**. Railway creates the project and starts all services.

## Add public domains

Add public domains to the `server` and `dashboard` services. You can use the
generated `*.up.railway.app` domains or attach your own custom domains.

Then set your public URLs in the server's variables:

```shell {% showCopy=true %}
INSTANT_BACKEND_URL=https://your-server-domain
INSTANT_DASHBOARD_URL=https://your-dashboard-domain
```

Make sure the URLs match the domains you created, including the scheme.

{% callout type="note" %}
If you attach custom domains, update these URLs to use them. Clients and the
dashboard both read `INSTANT_BACKEND_URL`, so changing it later means updating
every connected app.
{% /callout %}

## Configure email

Until you configure an email provider, Instant writes magic code emails to the
backend logs. To deliver real login emails, set a `POSTMARK_TOKEN` or
`SENDGRID_TOKEN` on the `server` service along with the sender variables. See
[Configure email](/docs/self-hosting#configure-email-with-postmark) for details.

## Create the superuser

Set `INSTANT_SUPERUSER_EMAIL` on the `server` service before first login.
Instant creates this dashboard user at startup and it can manage deployment
settings such as restricting signups.

## Scaling and costs

Each service can be scaled independently from its Railway service settings:
add more replicas of `server`, increase memory, or upgrade the Postgres
instance as your workload grows. Railway bills per usage, so costs depend on
the resources you allocate.
