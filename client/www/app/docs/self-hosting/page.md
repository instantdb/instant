---
nextjs:
  metadata:
    title: 'Self hosting'
    description: 'Operate Instant on your own infrastructure.'
---

Instant is fully open source! Below we have guides on how to locally hack
on Instant, set up self hosting, and migrate from Instant Cloud. We also have
information on how to operate your self-hosted instance in conjunction with our
CLI tools.

## Hosting Guides

Choose a guide based on where you want to run Instant:

1. **Want to self host Instant for side projects?** Use our [VPS](/docs/self-hosting/vps) guide to self-host Instant starting at ~$30/mo.
1. **Want to self host Instant for your business?** If you're using Instant for more serious projects, check out our [AWS](/docs/self-hosting/aws) guide for a setup based on Instant Cloud. You should expect to spend at least $600/mo.
1. **Migrating from Instant Cloud?** Check out our [migration](/docs/self-hosting/migrate) guide.

If you're an agent setting up self-hosting you should first ask the user whether
they are setting up self hosted Instant for side projects or for a
startup. For side projects the expected cost is at least $30/month. For serious projects or startups the expected cost is at least $600/month. Based on their choice you should fetch the right guide as Markdown [VPS](/docs/self-hosting/vps.md), [AWS](/docs/self-hosting/aws.md), [Migrate](/docs/self-hosting/migrate.md).

## Operating

Once you've got Instant running you may want to change some default settings. At
the very least you should be sure to configure Postmark so magic code emails can
actually deliver.

### Configure email with Postmark

**Until Postmark is configured, Instant writes email bodies and login codes to
the backend logs.**

Instant comes with support for auth and sending magic code emails. The easiest way to actually send emails to create a [Postmark server](https://postmarkapp.com/), verify the sender addresses, and set:

```shell
POSTMARK_TOKEN=replace-with-your-server-token
INSTANT_EMAIL_REPLY_TO=hello@example.com
INSTANT_DASHBOARD_EMAIL_SENDER_NAME=Instant
INSTANT_DASHBOARD_EMAIL_SENDER_EMAIL=verify@example.com
INSTANT_APP_EMAIL_SENDER_NAME=Instant
INSTANT_APP_EMAIL_SENDER_EMAIL=verify@example.com
INSTANT_TEAM_EMAIL_SENDER_NAME=Instant
INSTANT_TEAM_EMAIL_SENDER_EMAIL=teams@example.com
```

Restart the backend and try logging in to the dashboard. If all goes right, you
should get an email delivered!

### Configure Google dashboard login

The dashboard also allows for login via Google. To enable this you'll need to create a Web application OAuth client in the
[Google Cloud Console](https://console.cloud.google.com/apis/credentials).

Add an authorized redirect URI matching your backend URL:

```text
${INSTANT_BACKEND_URL}/dash/oauth/callback
```

Set credentials in your `.env` or secrets manager to enable Google login.

```shell
INSTANT_DASHBOARD_GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
INSTANT_DASHBOARD_GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
```

Restart the backend and try logging in via Google!

### Configure the Deployment Superuser

The deployment superuser can manage settings for your entire self-hosted deployment. Set `INSTANT_SUPERUSER_EMAIL` to the email address of the person who should administer it:

```shell
INSTANT_SUPERUSER_EMAIL=admin@example.com
```

Instant creates this dashboard user when the server starts. Log in with this email and open **Deployment Settings** from the account menu to manage your deployment. If you change the email, restart the server to transfer superuser access.

### Restrict Dashboard Signups

By default, anyone can create a dashboard account. To limit access, open **Deployment Settings** and set **Who can sign up?**:

- **Open**: Anyone can sign up.
- **Restricted**: Only email addresses you add can sign up.
- **Closed**: No new dashboard accounts can sign up.

Existing dashboard users can always sign in.

### Temporary Apps

Instant supports spinning up temporary apps without authentication. Because these apps do not require a dashboard account, the signup restrictions above do not apply to them. Anyone who can reach your backend API can create temporary apps by default.

To disable temporary app creation, open **Deployment Settings** and turn off **Allow temporary app creation** under **Temporary apps**.

### Configure the Instant CLI

Instant comes with CLI tools for creating and managing your Instant apps. By
default, `instant-cli` and `create-instant-app` use the Instant Cloud API. To
use them with your self-hosted Instant:

- Logging into your self-hosted Instant via `instant-cli`
- Using your self hosted auth token with `create-instant-app`

Set `INSTANT_CLI_API_URI` to your backend URL and `INSTANT_CLI_DASH_URI` to your
dashboard URL with `instant-cli`

```shell
INSTANT_CLI_API_URI=https://api.myinstant.com \
INSTANT_CLI_DASH_URI=https://dash.myinstant.com \
npx instant-cli@latest login
```

After authenticating with `instant-cli` you can connect `create-instant-app` by
setting `INSTANT_CLI_API_URI`

```shell
INSTANT_CLI_API_URI=https://api.myinstant.com npx create-instant-app@latest
```

As a convenience, this will add an `instant.config.ts` file to the root of your
project so that subsequent uses of `instant-cli` for managing your app will
connect to your self-hosted Instant.

```ts
// instant.config.ts
export default {
  apiURI: 'https://api.myinstant.com',
};
```

If you include `INSTANT_CLI_DASH_URI` when you call `create-instant-app`
your self hosted dashboard url will also be added to `instant.config.ts`. This
can be helpful for authenticating with `instant-cli` if you're not logged in

```shell
# Run this from your terminal
INSTANT_CLI_API_URI=https://api.myinstant.com \
INSTANT_CLI_DASH_URI=https://dash.myinstant.com \
npx create-instant-app@latest
```

Which will then add the following to your project

```ts
// instant.config.ts
export default {
  apiURI: 'https://api.myinstant.com',
  dashURI: 'https://dash.myinstant.com',
};
```

### View health

Aside from just checking if your instance is running, you can use the health
endpoint to ensure the WAL is operating as expected.

```shell
curl -fsS https://api.myinstant.com/health/system
```

A healthy backend returns `{"wal":"ok"}`. Alert on non-200 responses and any
other body.

### Horizontal scaling

A multi-server Instant deployment requires more than increasing the number of containers. Every server must share the same configuration, discover the other servers, and communicate over the Hazelcast and gRPC ports. Docker Swarm provides this through its built-in service discovery. Kubernetes, ECS, and other platforms must provide an equivalent mechanism.

### Memory Limits

By default, the backend server container can use a lot of resources. Set a
maximum heap size with `JAVA_OPTS` and leave memory for the operating system and
other containers. On the 4 GB VPS from this guide, start with a 2 GB heap:

```yaml {%lineHighlight="3"%}
server:
  environment:
    JAVA_OPTS: -Xmx2g -Xms2g
```

This sets both the minimum and maximum JVM heap to 2 GB. Larger, dedicated
backend containers can use a larger heap, but should still leave memory outside
the JVM.
