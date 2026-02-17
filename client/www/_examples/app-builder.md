[!video](https://www.youtube.com/watch?v=HRACNTmikZI 'Use React Native + InstantDB to Build a Self-Building App')

# Quickstart

Clone the repo and install dependencies:

```bash
# Clone repo
git clone https://github.com/Galaxies-dev/app-builder

# Navigate into the project
cd app-builder

# Install dependencies
npm install
```

If you haven't already, be sure to log into the Instant CLI

```bash
npx instant-cli login
```

Now let's initialize a new app with the Instant CLI.

```bash
npx instant-cli init
```

We've provided a schema in `instant.schema.ts` that you can push to your app.
You may have already pushed this during `init` in the previous step. If you
answered 'no' to the prompt during init, or if you're unsure whether you pushed
the schema, you can push it now.

```bash
npx instant-cli push
```

Finally, run the development server:

```bash
npm run start
```

Scan the QR code with your phone and follow the instructions on the screen.

# Learn More

- [Getting started with React Native](/docs/start-rn)
- [Working with data](/docs/init)
- [Storage](/docs/storage)
- [Platform API](/docs/platform-api)
