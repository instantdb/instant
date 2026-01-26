---
title: Getting started with React Native
description: How to use Instant with React Native
---

You can use Instant in React Native projects too! Below is an example using Expo.

Open up your terminal and do the following:

```shell {% showCopy=true %}
# Create an app with expo
npx create-expo-app instant-rn-demo
cd instant-rn-demo

# Install instant
npm i @instantdb/react-native

# Install peer dependencies
npm i @react-native-async-storage/async-storage @react-native-community/netinfo react-native-get-random-values
```

Now open up `app/(tabs)/index.tsx` in your favorite editor and replace the entirety of the file with the following code.

```tsx {% showCopy=true %}
import { init, i, InstaQLEntity } from '@instantdb/react-native';
import { View, Text, Button, StyleSheet } from 'react-native';

// Instant app
const APP_ID = '__APP_ID__';

// Optional: You can declare a schema!
const schema = i.schema({
  entities: {
    colors: i.entity({
      value: i.string(),
    }),
  },
});

type Color = InstaQLEntity<typeof schema, 'colors'>;

const db = init({ appId: APP_ID, schema });

const selectId = '4d39508b-9ee2-48a3-b70d-8192d9c5a059';

function App() {
  const { isLoading, error, data } = db.useQuery({
    colors: {
      $: { where: { id: selectId } },
    },
  });
  if (isLoading) {
    return (
      <View>
        <Text>Loading...</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View>
        <Text>Error: {error.message}</Text>
      </View>
    );
  }

  return <Main color={data.colors[0]} />;
}

function Main(props: { color?: Color }) {
  const { value } = props.color || { value: 'lightgray' };

  return (
    <View style={[styles.container, { backgroundColor: value }]}>
      <View style={[styles.contentSection]}>
        <Text style={styles.header}>Hi! pick your favorite color</Text>
        <View style={styles.spaceX4}>
          {['green', 'blue', 'purple'].map((c) => {
            return (
              <Button
                title={c}
                onPress={() => {
                  db.transact(db.tx.colors[selectId].update({ value: c }));
                }}
                key={c}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  spaceY4: {
    marginVertical: 16,
  },
  spaceX4: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 16,
  },
  contentSection: {
    backgroundColor: 'white',
    opacity: 0.8,
    padding: 12,
    borderRadius: 8,
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
  },
});

export default App;
```

If you haven't already, install the Expo Go app on iOS or Android. Once you have that installed you can run the app from your terminal.

```
npm run start
```

Scan the QR code with your phone and follow the instructions on the screen :)

Huzzah 🎉 You've got your first React Native Instant app running! Check out the [Working with data](/docs/init) section to learn more about how to use Instant!

## Using MMKV for faster storage (optional)

By default, Instant uses [AsyncStorage](https://react-native-async-storage.github.io/async-storage/) to persist data on device. If you want faster read/write performance, you can use [MMKV](https://github.com/mrousavy/react-native-mmkv) instead.

### Install the MMKV package

```shell {% showCopy=true %}
npm i @instantdb/react-native-mmkv

# Install MMKV peer dependencies
npx expo install react-native-mmkv react-native-nitro-modules
```

Note: MMKV requires native code, so you'll need to run a prebuild:

```shell {% showCopy=true %}
npx expo prebuild
```

### Configure Instant to use MMKV

Import `Store` from `@instantdb/react-native-mmkv` and pass it to `init`:

```tsx {% showCopy=true %}
import { init } from '@instantdb/react-native';
import Store from '@instantdb/react-native-mmkv';

const db = init({
  appId: APP_ID,
  Store: Store,
});
```

Then run your app on a device or simulator:

```shell {% showCopy=true %}
npx expo run:ios # or npx expo run:android
```

That's it! Instant will now use MMKV for local persistence instead of AsyncStorage.

### Implementing your own store

You can also implement your own local cache interface by extending `StoreInterface` from `@instantdb/react-native`. Here's an example in-memory store implementation:

```tsx {% showCopy=true %}
import {
  StoreInterface,
  StoreInterfaceStoreName,
} from '@instantdb/react-native';

class InMemoryStore extends StoreInterface {
  _map: Map<string, any>;

  constructor(appId: string, storeName: StoreInterfaceStoreName) {
    super(appId, storeName);
    this._map = new Map();
  }

  async getItem(key: string): Promise<any> {
    return this._map.get(key) ?? null;
  }

  async multiSet(keyValuePairs: Array<[string, any]>): Promise<void> {
    for (const [key, value] of keyValuePairs) {
      this._map.set(key, value);
    }
  }

  async removeItem(key: string): Promise<void> {
    this._map.delete(key);
  }

  async getAllKeys(): Promise<string[]> {
    return Array.from(this._map.keys());
  }
}
```

Then pass your custom store class to `init`:

```tsx {% showCopy=true %}
import { init } from '@instantdb/react-native';

const db = init({
  appId: APP_ID,
  Store: InMemoryStore,
});
```
