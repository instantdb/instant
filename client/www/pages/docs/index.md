---
title: Getting started
pageTitle: Instant - The Modern Firebase.
description: How to use Instant with React
---

Instant is the Modern Firebase. With Instant you can easily build realtime and collaborative apps like Notion or Figma.

Curious about what it's all about? Try a {% blank-link href="https://instantdb.com/tutorial" label="demo" /%}. Have questions? {% blank-link href="https://discord.com/invite/VU53p7uQcE" label="Join us on discord!" /%}

And if you're ready, follow the quick start below to **build a live app in less than 5 minutes!**

## Quick start

To use Instant in a brand new project, fire up your terminal and run the following command. Select **Next.js** as the framework.

```shell {% showCopy=true %}
npx create-instant-app instant-demo
cd instant-demo
```

{% has-app-id %}
Add your app ID to the .env file:

```sh
NEXT_PUBLIC_INSTANT_APP_ID=__APP_ID__
```

{% else %}
{% blank-link href="http://localhost:3000/dash" label="Create a new app" /%} and add your app ID to the .env file:

```sh
NEXT_PUBLIC_INSTANT_APP_ID=<YOUR_APP_ID_HERE>
```

{% /else %}
{% /has-app-id %}

Start up the development server:

```shell
npm run dev
```

Go to `localhost:3000`, aand huzzah 🎉 You've got your first Instant web app running! Check out the [Working with data](/docs/init) section to learn more about how to use Instant :)
