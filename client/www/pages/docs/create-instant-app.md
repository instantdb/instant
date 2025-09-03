---
title: Create Instant App
description: Use create-instant-app to scaffold a new Instant project
---

Once you know the basics of Instant, you may find it useful to be able to
quickly scaffold a new Instant project. We built `create-instant-app` to do just
that.

We currently offer templates for Next.js, Expo, and Vanilla Typescript. Follow the quick start below to give it a spin!

## Quick start

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

Run the dev server to see your new app in action!

```shell
npm run dev
```

Huzzah! 🎉 You now have a brand new Instant project to play around with!

## One-shot with Claude Code

Got Claude Code? You can use it one-shot a full-stack Instant app!

Use `create-instant-app` with the `--ai` flag and you'll be prompted to describe the app you want. Give it a try!

{% tabbed-single tabs={
  "npx": { "label": "npx", "content": "npx create-instant-app --ai" },
  "pnpx": { "label": "pnpx", "content": "pnpx create-instant-app --ai" },
  "bunx": { "label": "bunx", "content": "bunx create-instant-app --ai" }
} defaultTab="npx" /%}

You can think of this as a one-shot app builder in the terminal. If you use
vercel you can even deploy your app by simply running `vercel` in the project.

Right now this only works with the Next.js template, but we plan to expand it to
Expo and Vanilla TS soon. We're keen to improve this feature so if you have any
feedback please let us know below or on [Discord](https://discord.com/invite/VU53p7uQcE)!
