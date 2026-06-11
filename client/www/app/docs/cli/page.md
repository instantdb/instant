---
nextjs:
  metadata:
    title: 'Instant CLI'
    description: 'How to use the Instant CLI to manage schema and permissions.'
---

The Instant CLI was designed to drive your Instant application entirely from a project's codebase. You can create apps, define your data model, and update your permissions, **all through your terminal**.

## Login

To get started, you need to log in to your Instant account. You can do this by running:

```shell {% showCopy=true %}
npx instant-cli@latest login
```

This will open a browser window where you can authenticate with your Instant account. Once authenticated you'll be able to run commands that interact with your Instant apps!

## Logout

To log out of your Instant account and remove your authentication token from your local device, run:

```shell {% showCopy=true %}
npx instant-cli@latest logout
```

This will clear your stored credentials. You'll need to login again to interact with your Instant apps.

## Init

After logging in, head on over to your project's root repository, and write:

```shell {% showCopy=true %}
npx instant-cli@latest init
```

This will guide you through picking an Instant app and generate two files for you:

- `instant.schema.ts` defines your application's data model.
- `instant.perms.ts` defines your permission rules.

If you want to quickly spin up a temporary app (for experiments or testing), you can use the `--temp` flag:

```shell {% showCopy=true %}
npx instant-cli@latest init --temp
```

This will create an ephemeral app that automatically deletes itself after 24 hours. You can later transfer a temporary app to your account with `instant-cli claim`.

To learn how to change `instant.schema.ts`, check our [Modeling Data](/docs/modeling-data). For `instant.perms.ts`, check out the [permissions](/docs/permissions) page.

## Push

When you're ready to publish your changes to `instant.schema.ts`, run:

```shell {% showCopy=true %}
npx instant-cli@latest push schema
```

This will evaluate your schema, compare it with production, and migrate your data model.

Similarly, when you change `instant.perms.ts`, you can run:

```shell {% showCopy=true %}
npx instant-cli@latest push perms
```

## Renaming fields

When you rename an attribute or link in your `instant.schema.ts` and push, the CLI needs to know whether you intend to **rename** the existing field or **delete** the old one and **create** a new one. By default, `push` will prompt you interactively:

```
Is posts.creator created or renamed from another attr?
  ~ posts.author › posts.creator    rename attr
  + posts.creator                   create attr
```

Use the arrow keys to select whether the field is a rename or a new creation.

### Renaming in CI

If you're running `push` in a non-interactive environment (e.g. CI), you can pass the `--rename` flag to specify renames explicitly:

```shell
npx instant-cli@latest push schema --rename posts.author:posts.creator
```

The format is `oldName:newName`. You can rename multiple fields at once:

```shell
npx instant-cli@latest push schema --rename posts.author:posts.creator stores.owner:stores.manager
```

This is especially useful when combined with `--yes` to skip confirmation prompts:

```shell
npx instant-cli@latest push schema --yes --rename posts.author:posts.creator
```

## Pull

Sometimes, you change your schema or rules from your Explorer. If you want to `pull` the latest version of schema and perms for production, write:

```shell {% showCopy=true %}
npx instant-cli@latest pull
```

This will generate new `instant.schema.ts` and `instant.perms.ts` files, based on your production state.

## Query

You can run InstaQL queries against your app directly from the terminal:

```shell {% showCopy=true %}
npx instant-cli@latest query '{ posts: { comments: {} } }'
```

This outputs clean JSON to stdout, making it easy to pipe into `jq` or use in scripts. It supports JSON5 syntax, so you don't need to quote your keys.

Each query requires an auth context flag:

- `--admin` bypasses permissions (default)
- `--as-email <email>` runs the query as a specific user with permissions applied
- `--as-guest` runs the query as an unauthenticated guest
- `--as-token <refresh-token>` runs the query as a user identified by their refresh token

For example, to see what a specific user can access:

```shell {% showCopy=true %}
npx instant-cli@latest query --as-email alice@example.com '{ posts: {} }'
```

The results match what your client queries return, including cardinality. If your schema defines a relationship as `has: "one"`, you'll get back a single object instead of an array.

## App ID

Whenever you run a CLI command, we look up your app id. You can either provide an app id as an option:

```shell
  npx instant-cli@latest init --app $MY_APP_ID
```

Or store it in your `.env` file:

```yaml
INSTANT_APP_ID=*****
```

As a convenience, apart from `INSTANT_APP_ID`, we also check for:

- `NEXT_PUBLIC_INSTANT_APP_ID` for next apps,
- `PUBLIC_INSTANT_APP_ID` for svelte apps,
- `VITE_INSTANT_APP_ID` for vite apps
- `NUXT_PUBLIC_INSTANT_APP_ID` for nuxt apps
- `EXPO_PUBLIC_INSTANT_APP_ID` for expo apps

## Where to save files

By default, Instant will search for your `instant.schema.ts` and `instant.perms.ts` file in:

1. The `root` directory: `./`
2. The `src` directory: `./src`
3. The `app` directory: `./app`

If you'd like to save them in a custom location, you can set the following environment variables:

- `INSTANT_SCHEMA_FILE_PATH` sets the location for your `instant.schema.ts` file.
- `INSTANT_PERMS_FILE_PATH` sets the location for your `instant.perms.ts` file.

```yaml
# in your .env file
INSTANT_SCHEMA_FILE_PATH=./src/db/instant.schema.ts
INSTANT_PERMS_FILE_PATH=./src/db/instant.perms.ts
```

## Authenticating in CI

In CI or similar environments, you may want to handle authentication without having to go through a web-based validation step each time.

In these cases, you can provide a `INSTANT_CLI_AUTH_TOKEN` environment variable.

To obtain a token for later use, run:

```shell {% showCopy=true %}
npx instant-cli@latest login -p
```

Instead of saving the token to your local device, the CLI will print it to your console. You can copy this token and provide it as `INSTANT_CLI_AUTH_TOKEN` later in your CI tool.

## Init without creating files

Sometimes you want to create an Instant app without generating `instant.schema.ts` and `instant.perms.ts` or modifying your .env files. You can do this by running:

```shell {% showCopy=true %}
npx instant-cli@latest init-without-files --title "Hello World"
```

The app's id and admin token are outputted to stdout as JSON:

```shell
{
  "app": {
    "appId": "4f1e575c-6c00-44dd-bc69-004e89b9d788",
    "adminToken": "67ce37cb-aa47-468d-9c54-99efcf40497f"
  },
  "error": null
}
```

You can also make ephemeral apps that will clean up themselves after >24 hours
via the `--temp` flag:

```shell {% showCopy=true %}
npx instant-cli@latest init-without-files --title "Hello World" --temp
```

You can also pipe the output of this command to `jq` to extract the app information for use in scripts:

```shell {% showCopy=true %}
output=$(npx instant-cli@latest init-without-files --title "Hello World" --temp)
if echo "$output" | jq -e '.error' > /dev/null; then
  echo "Error: $(echo "$output" | jq -r '.error')"
  exit 1
fi
appId=$(echo "$output" | jq -r '.appId')
adminToken=$(echo "$output" | jq -r '.adminToken')
```

## OAuth clients and redirect origins

You can manage OAuth clients and redirect origins from the CLI in addition to the dashboard. Run `--help` on any subcommand for the full list of provider-specific flags.

```shell
# Add a Google web client using Instant's dev credentials
npx instant-cli@latest auth client add \
  --type google --app-type web \
  --name google-web --dev-credentials

# List existing clients
npx instant-cli@latest auth client list

# Upgrade a Google dev client to your own credentials
npx instant-cli@latest auth client update \
  --name google-web \
  --client-id <id> --client-secret <secret>

# Add a redirect origin
npx instant-cli@latest auth origin add \
  --type website --url <your-domain>
```

## Magic Code Templates

You can manage your email templates for sending magic codes by using an `instant.email.ts` file in your codebase.

To create the file and pull in the current configuration:
```shell
npx instant-cli@latest auth email pull
```

It will create a file like this:
```typescript
const email = {
  authEmail: {
    subject: "{code} is your verification code for {app_title}",
    senderName: "My App",
    senderEmail: "verify@myapp.com",
    body: `<div style="background: #f6f6f6; font-family: Helvetica, Arial, sans-serif; line-height: 1.6; font-size: 18px;">
      <div style="max-width: 650px; margin: 0 auto; background: white; padding: 20px;">
        <p><strong>Welcome,</strong></p>
        <p>
          You asked to join {app_title}. To complete your registration, use this
          verification code:
        </p>
        <h2 style="text-align: center"><strong>{code}</strong></h2>
        <p>
          Copy and paste this into the confirmation box, and you'll be on your way.
        </p>
        <p>
          Note: This code will expire in {expiration}, and can only be used once. If
          you didn't request this code, please reply to this email.
        </p>
      </div>
    </div>`,
  },
};

export default email;
````

We provide a few dynamic variables for you to use in your email:

{code}: the magic code e.g. 123456

{app_title}: your app's title, i.e. test-fresh

{user_email}: the user's email address, e.g. happyuser@gmail.com

{expiration}: the magic code expiration, e.g. 10 minutes


{% callout type="note" %}
Note: {code} is required in both the subject and body.
{% /callout %}

Commands to manage the email template:

```shell
# Save your changes to `instant.email.ts`
npx instant-cli@latest auth email push

# View the status of the email configuration and verification
npx instant-cli@latest auth email status

# Reset your email template to the Instant default template (only updates the file, requires push)
npx instant-cli@latest auth email reset

# Verify a custom email address using the code sent to the email.
npx instant-cli@latest auth email verify <code>

# Resend the custom address verification email
npx instant-cli@latest auth email resend
```
