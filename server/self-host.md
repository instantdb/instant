# Self-hosting the Instant server

This guide summarizes a few configuration points when running `instant-standalone.jar` yourself.

## Building the jar

Run the Uber build to package all sources and resources:

```sh
clj -T:build uber
```

The jar will appear at `target/instant-standalone.jar`.

## Overriding the server origin

The server computes callback URLs from `server-origin`. By default this value depends on the environment but you can override it at runtime:

```bash
export SERVER_ORIGIN="https://api.example.com"
```

Restart the jar to pick up the new value.

## Using Minio instead of S3

Set `S3_ENDPOINT` to point the S3 clients at your local Minio instance:

```bash
export S3_ENDPOINT="http://localhost:9000"
export AWS_ACCESS_KEY_ID=...    # your Minio access key
export AWS_SECRET_ACCESS_KEY=... # your Minio secret key
```

Create the bucket specified by the server configuration before starting the jar.

## Keycloak as an OAuth provider

Create a provider and client in the dashboard using the Keycloak discovery URL:

```json
{ "provider_name": "keycloak" }
```

Then register an OAuth client:

```json
{
  "provider_id": "<provider-id>",
  "client_name": "my-keycloak",
  "client_id": "<oidc-client-id>",
  "client_secret": "<oidc-client-secret>",
  "discovery_endpoint": "https://keycloak.lab1.bios.dev/realms/<realm>/protocol/openid-connect/.well-known/openid-configuration"
}
```

Use the resulting `client_name` when starting an OAuth flow from your frontend.

## Production mode

Set `PRODUCTION=true` to run in production mode. This enables background jobs and uses production defaults. If Honeycomb credentials are absent, the tracer falls back to log-only mode.

