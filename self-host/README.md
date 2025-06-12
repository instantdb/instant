# Self Hosting

## Backend

- Override server origin for OAuth with env var: `SERVER_ORIGIN`
- Override S3: TBD

## Frontend

The `./client/README.md` covers how to point the www frontend to your localhost backend. It can also point to any arbitrary hostname:

- Run this in console: `localStorage.setItem('devHost', '"http://my-local-lab-host:8888"');`
- And for backend: `NEXT_PUBLIC_DEVHOST=http://my-local-lab-host:8888 pnpm run dev`

## CLI

```
$ INSTANT_CLI_VERBOSE=true INSTANT_CLI_DEV=true INSTANT_CLI_API_URI=http://my-local-lab-host:8888 npx instant-cli@latest login
Let's log you in!
Login register response: 200 OK
Login register json: {
  "secret": "eaf69192-a843-43e3-ada4-cf22ffaa2ab6",
  "ticket": "f232863d-bfb0-4af5-a1c1-9d9f8fc8a5c5"
}
? This will open instantdb.com in your browser, OK to proceed? no / yes
```

If you are running this on a local machine, it will pop open to your custom frontend.

If you are running remotely, you will need to construct the URL after you Sign Up per `./client/README.md` prior:

```
http://my-local-lab-host:8888/dash?ticket=f232863d-bfb0-4af5-a1c1-9d9f8fc8a5c5
```

# Other Points

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

## Overriding the dashboard origin

The frontend dashboard uses `dashboard-origin` to generate OAuth redirect URLs
and to validate CORS requests. By default this value depends on the environment
and falls back to `http://localhost:3000` when running locally. You can override
it at runtime:

```bash
export DASHBOARD_ORIGIN="https://dashboard.example.com"
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

## Production mode

Set `PRODUCTION=true` to run in production mode. This enables background jobs and uses production defaults. If Honeycomb credentials are absent, the tracer falls back to log-only mode.

