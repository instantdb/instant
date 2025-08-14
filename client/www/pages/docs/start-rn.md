---
title: Getting started with React Native
description: How to use Instant with React Native
---

You can use Instant in React Native projects too! Below is an example using Expo. Open up your terminal, run this command and select **Expo** as the framework:

```shell {% showCopy=true %}
npx create-instant-app instant-expo-demo
cd instant-expo-demo
```

{% has-app-id %}
Add your app ID to the .env file:

```sh
EXPO_PUBLIC_INSTANT_APP_ID=__APP_ID__
```

{% else %}
{% blank-link href="http://localhost:3000/dash" label="Create a new app" /%} and add your app ID to the .env file:

```sh
EXPO_PUBLIC_INSTANT_APP_ID=<YOUR_APP_ID_HERE>
```

{% /else %}
{% /has-app-id %}

If you haven't already, install the Expo Go app on iOS or Android. Once you have that installed you can run the app from your terminal.

```
npm run dev
```

Scan the QR code with your phone and follow the instructions on the screen :)

Huzzah 🎉 You've got your first React Native Instant app running! Check out the [Working with data](/docs/init) section to learn more about how to use Instant!
