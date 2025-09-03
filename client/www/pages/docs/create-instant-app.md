---
title: Create Instant App
description: Use create-instant-app to scaffold a new Instant project
---

Once you know the basics of Instant, you may find it useful to be able to
quickly scaffold a new Instant project. We built `create-instant-app` to do just
that. Follow quick start below to give it a spin!

## Quick Start

To scaffold a brand new Instant project, fire up your terminal and run the following command.

```shell {% showCopy=true %}
npx create-instant-app instant-demo
cd instant-demo
```

We currently support the following templates:

```
○ Next.js
○ Vite: Vanilla TS
○ Expo: React Native
```

{% has-app-id %}
Once you complete the prompts add your app ID to the .env file:

```sh
NEXT_PUBLIC_INSTANT_APP_ID=__APP_ID__
```

{% else %}
Once you complete the prompts {% blank-link href="http://localhost:3000/dash" label="create a new app" /%} and add your app ID to the .env file:

```sh
NEXT_PUBLIC_INSTANT_APP_ID=<YOUR_APP_ID_HERE>
```

{% /else %}
{% /has-app-id %}

Start up the development server:

```shell
npm run dev
```
