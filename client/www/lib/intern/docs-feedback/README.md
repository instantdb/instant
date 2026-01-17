# Instant Docs Feedback Dashboard

Overview of feedback received from users on documentation pages for Instant.

## See it live

You can see the tool at `/intern/docs-feedback`.

You'll need to auth with an @instantdb.com email to see the data

## Export the app locally

To get the docs feedback app data locally, run our export script from the server
repo

```
scripts/export.sh --email 'your-email-address' --app-id 5d9c6277-e6ac-42d6-8e51-2354b4870c05
```

## Updating schema/perms

First update locally to test changes

```
INSTANT_CLI_DEV=1 pnpx instant-cli@latest push --app 5d9c6277-e6ac-42d6-8e51-2354b4870c05
```

Once everything looks good you can push to prod

```
pnpx instant-cli@latest push --app 5d9c6277-e6ac-42d6-8e51-2354b4870c05
```
