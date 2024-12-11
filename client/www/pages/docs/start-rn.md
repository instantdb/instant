---
title: Getting started with React Native
---

You can use Instant in React Native projects too! Below is an example using Expo. Open up your terminal and do the following:

```shell
# Create an app with expo
npx create-expo-app instant-rn-demo
cd instant-rn-demo

# Install instant
npm i @instantdb/react-native

# Install peer dependencies
npm i @react-native-async-storage/async-storage @react-native-community/netinfo react-native-get-random-values
```

Now open up `app/(tabs)/index.tsx` in your favorite editor and replace the entirety of the file with the following code.

```typescript {% showCopy=true %}
import { init, tx } from "@instantdb/react-native";
import { View, Text, Button, StyleSheet } from "react-native";

// Instant app
const APP_ID = '__APP_ID__';

type Schema = { colors: { color: string } };

const db = init<Schema>({ appId: APP_ID });

function App() {
  const { isLoading, error, data } = db.useQuery({ colors: {} });
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

  return <Main colorEntity={data.colors[0]} />;
}

const selectId = "4d39508b-9ee2-48a3-b70d-8192d9c5a059";

function Main(props: { colorEntity?: { color: string } }) {
  const { color } = props.colorEntity || { color: "white" };

  return (
    <View style={[styles.container, { backgroundColor: color }]}>
      <View style={[styles.contentSection]}>
        <Text style={styles.header}>Hi! pick your favorite color</Text>
        <View style={styles.spaceX4}>
          {["green", "blue", "purple"].map((c) => {
            return (
              <Button
                title={c}
                onPress={() => {
                  db.transact(tx.colors[selectId].update({ color: c }));
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
    justifyContent: "center",
    alignItems: "center",
  },
  spaceY4: {
    marginVertical: 16,
  },
  spaceX4: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginHorizontal: 16,
  },
  contentSection: {
    backgroundColor: "white",
    opacity: 0.8,
    padding: 12,
    borderRadius: 8,
  },
  header: {
    fontSize: 24,
    fontWeight: "bold",
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

Huzzah 🎉 You've got your first React Native Instant app running! Check out the [**Explore**](/docs/init) section to learn more about how to use Instant!
