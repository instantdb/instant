---
title: Getting started with Vanilla JS
description: How to use Instant with Vanilla JS
---

You can use Instant with plain ol' Javascript/Typescript too. You may find this helpful to integrate Instant with a framework that doesn't have an official SDK yet.

To use Instant in a brand new project fire up your terminal set up a new project with Vite.

```shell {% showCopy=true %}
npx create-instant-app instant-vanilla
cd instant-vanilla
```

{% has-app-id %}
Add your app ID to the .env file:

```sh
VITE_INSTANT_APP_ID=__APP_ID__
```

{% else %}
{% blank-link href="http://localhost:3000/dash" label="Create a new app" /%} and add your app ID to the .env file:

```sh
VITE_INSTANT_APP_ID=<YOUR_APP_ID_HERE>
```

{% /else %}
{% /has-app-id %}

Start up the development server:

```shell
npm run dev
```

Go to `localhost:5173` and follow the final instruction to load the app!

Huzzah 🎉 You've got your first Instant web app running! Check out the [Working with data](/docs/init) section to learn more about how to use Instant :)
