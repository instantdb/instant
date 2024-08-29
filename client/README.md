<p align="center">
  <a href="#">
    <img alt="Shows the Instant logo" src="https://instantdb.com/img/icon/android-chrome-512x512.png" width="10%">
  </a>
  <h1 align="center">instant-client</h1>
</p>

This houses Instant's javascript monorepo! Here's the lay of the land:

1. [`www/`](./www/)
   1. This is a nextjs app. It’s the frontend for [instantdb.com](https://instantdb.com), including the dashboard and docs.
2. [`packages/`](./packages/)
   1. These are where our client libraries live:
      1. [`@instantdb/core`](./packages/core)
      2. [`@instantdb/react`](./packages/react/)
      3. [`@instantdb/react-native`](./packages/react-native)
      4. [`@instantdb/admin`](./packages/admin)
      5. [`instant-cli`.](./packages/cli/)
3. [`sandbox/`](./sandbox/)
   1. We built a few example apps, to make it easy to develop against the local version of `packages`.

# Development

To kick everything off:

```bash
cd client
corepack enable # enables pnpm
pnpm i
make dev
```

With that, all frontend code should be up and running! 

## Dashboard & Docs

Visit [localhost:3000](http://localhost:3000), and you'll see Instant's homepage. You can make changes to the marketing pages, dashboard, or docs here.

If you press `cmd + shift + 9`, you'll also see a devtool window pop up. This can be useful if you want to enable feature flags.

### Connect to a local backend

Right now all backend requests will go to api.instantdb.com. If you want to develop against your local backend, load [localhost:3000](http://localhost:3000), and set the `devBackend` flag:

```javascript
localStorage.setItem("devBackend", true);
```

Now all requests will go to your your local backend at [localhost:8888](http://localhost:8888). If you haven't set up a local backend, follow the [server README](../server/README.md)

You can then follow [these steps to create an app id locally.](https://discord.com/channels/1031957483243188235/1031957483826204705/1278654888674328636)

## Packages and sandbox

All client SDKs live in `packages/`. 

To develop against them, we've created a few `sandbox` examples. These examples let you locally test changes to the client SDK. We recommend you create an app in your dev environment and use it in each directories `.env` file

Based on what you change, you'll play with different examples:

1. [`@instantdb/core`](./packages/core) ➡ [`sandbox/vanilla-js-vite/`](./sandbox/vanilla-js-vite/)
2. [`@instantdb/react`](./packages/react/) ➡ [`sandbox/react-nextjs/`](./sandbox/react-nextjs/)
3. [`@instantdb/react-native`](./packages/react-native) ➡[`sandbox/react-native-expo/`](./sandbox/react-native-expo/)
4. [`@instantdb/admin`](./packages/admin) ➡ [`sandbox/admin-sdk-express`](./sandbox/admin-sdk-express/)

Check out the sandbox READMEs to see how to run them.

# Questions?

If you have any questions, feel free to drop us a line on our [Discord](https://discord.com/invite/VU53p7uQcE)!
