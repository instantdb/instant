---
title: Sign In with Apple
---

Instant supports Sign In with Apple in native applications.

{% nav-group %}
{% nav-button param="method" value="rn-webflow"
            title="React Native"
            description="An example of using Sign In with Apple in React Native app"
            /%}
{% /nav-group %}


{% conditional param="method" value="rn-webflow" %}
## React Native flow

Instant comes with support for [Expo AppleAuthentication library](https://docs.expo.dev/versions/latest/sdk/apple-authentication/).

### Installation

Add dependency:

```shell {% showCopy=true %}
npx expo install expo-apple-authentication
```

### Configuration in app config

Update `app.json` by adding:

```json {% showCopy=true %}
{
  "expo": {
    "ios": {
      "usesAppleSignIn": true
    }
  }
}
```

### Preparing Instant

Go to Instant dashboard → Auth tab → Redirect Origins → Add an origin.

Add `exp://` for development with Expo.

### Sign in code

Authenticate with Apple and then pass identityToken to Instant along with `clientName: "apple"`:

```javascript {% showCopy=true %}
const [nonce] = useState("" + Math.random());
try {
  // sign in with Apple
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: nonce
  });

  // pass identityToken to Instant
  db.auth.signInWithIdToken({
    clientName: "apple",
    idToken: credential.identityToken,
    nonce: nonce
  }).catch((err) => {
    console.log('Error', err.body?.message, err);
  });
} catch (e) {
  if (e.code === 'ERR_REQUEST_CANCELED') {
    // handle that the user canceled the sign-in flow
  } else {
    // handle other errors
  }
}
```

### Sign out code

```javascript {% showCopy=true %}
<Button
  title="Sign Out"
  onPress={async() => {
    await db.auth.signOut(user.email);
  }} />
```

### Full example

```javascript {% showCopy=true %}
import React, { useState } from 'react';
import { Button, View, Text, StyleSheet } from 'react-native';
import { init, tx } from '@instantdb/react-native';
import * as AppleAuthentication from 'expo-apple-authentication';

const APP_ID = '__APP_ID__';
const db = init({appId: APP_ID});

export default function App() {
  const { isLoading, user, error } = db.useAuth();
  if (isLoading) {
    return <View style={styles.container}><Text>Loading...</Text></View>;
  }
  if (error) {
    return <View style={styles.container}><Text>Uh oh! {error.message}</Text></View>;
  }
  if (user) {
    return <View style={styles.container}>
      <Text>Hello {user.email}!</Text>
      <Button
        title="Sign Out"
        onPress={async() => {
          await db.auth.signOut(user.email);
        }}/>
    </View>;
  }
  return <Login />;
}

function Login() {
  const [nonce] = useState("" + Math.random());
  return (
    <View style={styles.container}>
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={5}
        style={styles.button}
        onPress={async () => {
          try {
            const credential = await AppleAuthentication.signInAsync({
              requestedScopes: [
                AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
                AppleAuthentication.AppleAuthenticationScope.EMAIL,
              ],
              nonce: nonce
            });
            // signed in
            db.auth.signInWithIdToken({
              clientName: "apple",
              idToken: credential.identityToken,
              nonce: nonce
            }).catch((err) => {
              console.log('Error', err.body?.message, err);
            });
          } catch (e) {
            if (e.code === 'ERR_REQUEST_CANCELED') {
              // handle that the user canceled the sign-in flow
            } else {
              // handle other errors
            }
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    width: 200,
    height: 44,
  },
});
```
{% /conditional %}


