---
nextjs:
  metadata:
    title: 'Migrate from Instant Cloud'
    description: 'Move an Instant Cloud app to self-hosted Instant.'
---

Migrating from Instant Cloud happens in two phases:

1. **Rehearse the migration:** Set up self-hosted Instant and restore a test backup. This confirms that everything works and gives you an estimate for downtime.
2. **Cut over:** Pause writes, restore a fresh backup, and point your app at your self-hosted Instant.

## Rehearse the migration

### Set up self-hosted Instant

If you haven't already, set up self-hosting with our [VPS](/docs/self-hosting/vps) or
[AWS](/docs/self-hosting/aws) guide. Make sure you can log in to the dashboard,
create an app, query it, and write data.

Before restoring your app:

- [Configure Postmark](/docs/self-hosting#configure-email-with-postmark) so magic code emails work.
- [Restrict dashboard signups](/docs/self-hosting#restrict-dashboard-signups) and [disable temporary apps](/docs/self-hosting#temporary-apps) to prevent unwanted app creation.
- Similarly if your app uses webhooks you'll need to configure those for your
  self-hosted app.

If your app uses OAuth for end-user sign-in, recreate each OAuth provider on
the restored app. Copy its client ID, client secret, and any other provider
settings. Then add the self-hosted callback URL to the provider:

```text
https://api.myinstant.com/runtime/oauth/callback
```

Keep the Instant Cloud callback configured until the migration is complete.

### Restore a test backup

Migrating without data loss will require some downtime. To get a sense of how
much time it will take we'll

1. Export a backup from Instant Cloud
2. Restore the backup into your self hosted Instant.

After restoring verify the following look correct:

- Schema and permissions
- Application data
- Files
- Magic code and each OAuth provider your app uses
- Email templates

### Prepare the client change

After successfully restoring we can put up a PR to update our clients to point
to our new self-hosted Instant app.

Choose a new app ID for the self-hosted app. The ID must be a valid UUID. You
can generate one in the terminal with:

```sh {% showCopy=true %}
uuidgen
```

This will be the ID your app going forward.

Create a PR that points your app at self-hosted Instant, but do not merge it
yet. Update the app ID, API URL, and WebSocket URL in every client `init` call:

```ts
const db = init({
  appId: 'YOUR_NEW_APP_ID',
  apiURI: 'https://api.myinstant.com',
  websocketURI: 'wss://api.myinstant.com/runtime/session',
});
```

If you use the Admin SDK, update its app ID, admin token, and `apiURI` too. Keep
the PR ready to merge as soon as the final restore finishes.

## Cut over

### Pause writes on Instant Cloud

Open the app's **Admin** page in the Instant Cloud dashboard. Turn on
**Read-only mode**, then wait 30 seconds for in-flight mutations to finish.

Reads, live queries, and presence will keep working. New writes will be
rejected, including offline writes queued on user devices. We do this to ensure
there is no data loss during cut over.

### Restore the final backup

Create an on demand backup of the Instant Cloud app and restore it into self-hosted
Instant using the app ID from the rehearsal.

Before merging our earlier PR to switch clients over:

- Check that `/health/system` returns `{"wal":"ok"}`.
- Check the restored schema, permissions, data, and files.
- Make sure **Read-only mode** is off on the self-hosted app.
- Test magic code and OAuth login if your app uses them.

### Switch to self-hosted Instant

Merge and deploy the PR you prepared earlier. New client connections will now
use the restored app on self-hosted Instant. Users may need to sign in again.

Watch the deployment and verify queries, writes, authentication, and file
uploads. Once clients begin writing to self-hosted Instant, the Instant Cloud
copy is no longer current. If you used OAuth you can remove the Instant Cloud
callback URL from each OAuth provider.

The migration should now be complete. Huzzah! 🎉
