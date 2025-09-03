---
title: Create Instant App
description: Use create-instant-app to scaffold a new Instant project
---

Once you know the basics of Instant, you may find it useful to be able to
quickly scaffold a new Instant project. We built `create-instant-app` to do just
that.

We currently offer templates for Next.js, Expo, and Vanilla Typescript. Follow the quick start below to give it a spin!

## Quick Start

To scaffold a brand new Instant project, fire up your terminal and run the following command to go through the scaffolding pomrpts.

```shell {% showCopy=true %}
npx create-instant-app instant-demo
cd instant-demo
```

{% has-app-id %}
Once you complete the prompts add your app ID to the .env file:

{% tabbed-single tabs={
  "nextjs": { "label": "Next.js", "content": "NEXT_PUBLIC_INSTANT_APP_ID=__APP_ID__" },
  "expo": { "label": "Expo", "content": "EXPO_PUBLIC_INSTANT_APP_ID=__APP_ID__" },
  "vite": { "label": "Vanilla TS", "content": "VITE_INSTANT_APP_ID=__APP_ID__" }
} defaultTab="nextjs" /%}

{% else %}
Once you complete the prompts {% blank-link href="http://localhost:3000/dash" label="create a new app" /%} and add your app ID to the .env file:

{% tabbed-single tabs={
  "nextjs": { "label": "Next.js", "content": "NEXT_PUBLIC_INSTANT_APP_ID=<YOUR_APP_ID_HERE>" },
  "expo": { "label": "Expo", "content": "EXPO_PUBLIC_INSTANT_APP_ID=<YOUR_APP_ID_HERE>" },
  "vite": { "label": "Vanilla TS", "content": "VITE_INSTANT_APP_ID=<YOUR_APP_ID_HERE>" }
} defaultTab="nextjs" /%}

{% /else %}
{% /has-app-id %}

Start up the development server:

```shell
npm run dev
```
