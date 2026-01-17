<p align="center">
  <a href="#">
    <img alt="Shows the Instant logo" src="https://instantdb.com/img/icon/android-chrome-512x512.png" width="10%">
  </a>
  <h1 align="center">sandbox/react-nextjs</h1>
</p>

This is sandbox app to play with [@instantdb/react](../../packages/react/).

# Development

First, let's set up your environment. Create an Instant app, either on your local backend or prod, and fill out the token info in your `.env` file.

```bash
cp .env.example .env
# fill in the variables in .env
```

Once done, load [localhost:4000](http://localhost:4000), and you'll see a list of example apps.

# Setting up local https

Add `--experimental-https` to `package.json`:

```
"scripts": {
  "dev": "next dev --experimental-https -p 4000",
}
```

In `config.ts`, change

```
http://localhost:8888
```

to

```
https://dev.instantdb.com:8889
```

and

```
ws://localhost:8888
```

to

```
wss://dev.instantdb.com:8889
```

After that, client address will be https://dev.instantdb.com:4000

# Questions?

If you have any questions, feel free to drop us a line on our [Discord](https://discord.com/invite/VU53p7uQcE)!
