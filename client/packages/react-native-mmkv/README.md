<p align="center">
  <a href="https://instantdb.com">
    <img alt="Shows the Instant logo" src="https://instantdb.com/img/icon/android-chrome-512x512.png" width="10%">
  </a>
  <h1 align="center">@instantdb/react-native-mmkv</h1>
</p>

<p align="center">
  <a 
    href="https://discord.com/invite/VU53p7uQcE" >
    <img height=20 src="https://img.shields.io/discord/1031957483243188235" />
  </a>
  <img src="https://img.shields.io/github/stars/instantdb/instant" alt="stars">
</p>

<p align="center">
   <a href="https://www.instantdb.com/docs/start-rn">Get Started</a> ·
   <a href="https://instantdb.com/examples">Examples</a> ·
   <a href="https://www.instantdb.com/docs/start-rn">Docs</a> ·
   <a href="https://discord.com/invite/VU53p7uQcE">Discord</a>
<p>

Welcome to [Instant's](http://instantdb.com) React Native MMKV interface.

## Usage

### Create an app with expo

```shell
npx create-expo-app instant-rn-demo
cd instant-rn-demo
```

### Install instant

```shell
npm i @instantdb/react-native @instantdb/react-native-mmkv
```

### Install peer dependencies

```shell
npx expo install react-native-mmkv react-native-nitro-modules @react-native-community/netinfo react-native-get-random-values @react-native-async-storage/async-storage
```

### Prebuild

```shell
npx expo prebuild
```

### Import Storage from @instantdb/react-native-mmkv

```javascript
// ༼ つ ◕_◕ ༽つ Real-time Chat
// ----------------------------------
// * Updates instantly
// * Multiplayer
// * Works offline

import { init, id } from '@instantdb/react-native';
import MMKVStore from '@instantdb/react-native-mmkv';

const db = init({
  appId: process.env.EXPO_PUBLIC_INSTANT_APP_ID,
  Store: MMKVStore
});

function Chat() {
  // 1. Read
  const { isLoading, error, data } = db.useQuery({
    messages: {},
  });

  // 2. Write
  const addMessage = (message) => {
    db.transact(db.tx.messages[id()].update(message));
  };

  // 3. Render!
  return <UI data={data} onAdd={addMessage} />;
}
```

# Get Started

Follow the [getting started](https://www.instantdb.com/docs/start-rn) tutorial to set up a live React Native app in under 5 minutes!

# Questions?

If you have any questions, feel free to drop us a line on our [Discord](https://discord.com/invite/VU53p7uQcE)
