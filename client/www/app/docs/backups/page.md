---
nextjs:
  metadata:
    title: 'Backups'
    description: 'How Instant creates backups, how to download them, and what a backup archive contains.'
---

Instant automatically generates a nightly backup that contains all of the data from your app.

You can view backups for the last 7 days from the `Backups` page on the dashboard, or with the cli:

```sh {% showCopy=true %}
npx instant-cli@latest backup list
```

## Downloading backups

You can download the backup as a zip file from the dashboard or through the cli:

```sh {% showCopy=true %}
npx instant-cli@latest backup download --latest
```

The backup contains your app's schema, rules, magic code email template, entities, and files.

### Anatomy of an Instant backup

The backup contains a `config.json` file that contains the schema, rules, and magic code email template. It also includes the number of entities for each table.

#### **Entities directory**

The `entities` directory contains an NDJSON file for each table in your schema that has at least one entity.

The files are named after the table name, e.g. `$users.jsonl`.

Each JSON line includes a `createdAt` field, formatted as a Unix timestamp in milliseconds.

The `entity` field holds the key-value map with all of the fields for the entity.

If the key in the entity map represents a has-one link, the value will be the entity id of the entity in the linked table. If it is a has-many link, then it will be a JSON array of entity ids in the linked table.

```json {% filename="entities/$users.jsonl" %}
{"entity":{"email":"dww@instantdb.com","id":"81d4e04d-4057-4fc0-92f7-d99618fd540a","type":"user"},"createdAt":1772650963417}
{"entity":{"id":"0e212052-a4ba-4d3c-a679-3812ba22cde2","type":"guest"},"createdAt":1776458067727}
```

#### **Files directory**

The `files` directory contains all of the file blobs for your app's `$files`.

Each listing in the `files` directory will be a `UUID` that will match the `location-id` field of a JSON line in the `entities/$files.jsonl` entry.

```json {% filename="entities/$files.jsonl" %}
{"entity":{"size":37240,"location-id":"30b051b6-cc5d-41ce-8538-8302d6fa2695","content-type":"image/png","id":"fd3a3356-f8d6-46cc-b56f-d3f470b44fbc","path":"profile.png"},"createdAt":1772604198270}
{"entity":{"size":13768,"location-id":"770755e9-5cf0-41d2-b1cc-6552255d2ba3","content-type":"image/png","id":"fda17e15-ba53-4a9e-9e9e-75e25c031191","path":"cat.png"},"createdAt":1773774285029}
```

```shell
$ ls -l files/
size   name
37240  30b051b6-cc5d-41ce-8538-8302d6fa2695
13768  770755e9-5cf0-41d2-b1cc-6552255d2ba3
```

# Restore a backup

You can restore a backup zipfile that you downloaded from the dashboard or through the cli into a self-hosted Instant instance.

Read the [Self hosting](/docs/self-hosting) guide for more information on how to set up a self-hosted instance.

Ensure that you've set the deployment superuser via the `INSTANT_SUPERUSER_EMAIL` environment variable.

Sign in to the dashboard with your superuser email, then visit `${your-selfhosted-dashboard-url}/intern/restore` to restore the app into your new self-hosted instance.

If you have any OAuth clients set up with client secrets, go to the Auth dashboard for the restored app and update the secrets. The secrets will not carry over to the restored app.
