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