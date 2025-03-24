---
title: Sign In with Apple
description: How to add Sign In with Apple to your Instant app.
---

{% nav-default value="web-popup" %}

Instant supports Sign In with Apple on the Web and in native applications.

{% nav-group %}
{% nav-button param="method" value="web-popup" title="Web Popup (recommended)" description="Use Apple-provided popup to authenticate users" /%}
{% nav-button param="method" value="web-redirect" title="Web Redirect" description="Use redirect flow to authenticate users" /%}
{% nav-button param="method" value="native" title="React Native" description="Authenticating in React Native app" /%}
{% /nav-group %}

## Step 1: Create App ID

- Navigate to [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list)
- Select _Identifiers_
- Click _+_
- _Register a new identifier_ → Select _App IDs_
- _Select a type_ → Select _App_
- _Capabilities_ → _Sign In with Apple_ → Check
- Fill in _Bundle ID_ and _Description_
- Click _Register_

## Step 2: Create Services ID

- Navigate to [Services IDs](https://developer.apple.com/account/resources/identifiers/list/serviceId)
- Click _+_
- _Register a new identifier_ → Select _Services IDs_
- Fill in _Description_ and _Identifier_. You’ll need this _Identifier_ later
- Click _Register_

{% conditional param="method" value="web-popup" %}

## Step 3: Configure Services ID (Web Popup flow)

- Select newly created Services ID
- Enable _Sign In with Apple_
- Click _Configure_
- Select _Primary App ID_ from Step 1
- To _Domains_, add your app domain (e.g. `myapp.com`)
- To _Return URLs_, add URL of your app where authentication happens (e.g. `https://myapp.com/signin`)
- Click _Continue_ → _Save_

{% /conditional %}

{% conditional param="method" value="web-redirect" %}

## Step 3: Configure Services ID (Web Redirect flow)

- Select newly created Services ID
- Enable _Sign In with Apple_
- Click _Configure_
- Select _Primary App ID_ from Step 1
- To _Domains_, add `api.instantdb.com`
- To _Return URLs_, add `https://api.instantdb.com/runtime/oauth/callback`
- Click _Continue_ → _Save_

## Step 3.5: Generate Private Key (Web Redirect flow only)

- Navigate to [Keys](https://developer.apple.com/account/resources/authkeys/list)
- Click _+_
- Fill in _Name_ and _Description_
- Check _Sign in with Apple_
- Configure → select _App ID_ from Step 1
- _Continue_ → _Register_
- Download key file

{% /conditional %}

{% conditional param="method" value="native" %}

## Step 3: Configure Services ID (React Native flow)

This step is not needed for Expo.
{% /conditional %}

## Step 4: Register your OAuth client with Instant

- Go to the Instant dashboard and select _Auth_ tab.
- Select _Add Apple Client_
- Select unique _clientName_ (`apple` by default, will be used in `db.auth` calls)
- Fill in _Services ID_ from Step 2
<!-- prettier-ignore -->{% conditional param="method" value="web-redirect" %}
- Fill in _Team ID_ from [Membership details](https://developer.apple.com/account#MembershipDetailsCard)
- Fill in _Key ID_ from Step 3.5
- Fill in _Private Key_ by copying file content from Step 3.5
<!-- prettier-ignore -->{% /conditional %}
- Click `Add Apple Client`

{% conditional param="method" value="web-redirect" %}

## Step 4.5: Whitelist your domain in Instant (Web Redirect flow only)

- In Instant Dashboard, Click _Redirect Origins_ → _Add an origin_
- Add your app’s domain (e.g. `myapp.com`)

{% /conditional %}

{% conditional param="method" value="web-popup" %}

## Step 5: Add Sign In code to your app (Web Popup flow)

Add Apple Sign In library to your app:

```
https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js
```

Initialize with `Services ID` from Step 2:

```javascript {% showCopy=true %}
AppleID.auth.init({
  clientId: '<Services ID>',
  scope: 'name email',
  redirectURI: window.location.href,
});
```

Implement `signInPopup` using `clientName` from Step 4:

```javascript {% showCopy=true %}
async function signInPopup() {
  let nonce = crypto.randomUUID();

  // authenticate with Apple
  let resp = await AppleID.auth.signIn({
    nonce: nonce,
    usePopup: true,
  });

  // authenticate with Instant
  await db.auth.signInWithIdToken({
    clientName: '<clientName>',
    idToken: resp.authorization.id_token,
    nonce: nonce,
  });
}
```

Add Sign In button:

```javascript {% showCopy=true %}
<button onClick={signInPopup}>Sign In with Apple</button>
```

{% /conditional %}

{% conditional param="method" value="web-redirect" %}

## Step 5: Add Sign In code to your app (Web Popup flow)

Create Sign In link using `clientName` from Step 4:

```
const authUrl = db.auth.createAuthorizationURL({
  clientName: '<clientName>',
  redirectURL: window.location.href,
});
```

Add a link uses `authUrl`:

```
<a href={ authUrl }>Sign In with Apple</a>
```

That’s it!
{% /conditional %}

{% conditional param="method" value="native" %}

## Step 5: Add Sign In code to your app (React Native flow)

Instant comes with support for [Expo AppleAuthentication library](https://docs.expo.dev/versions/latest/sdk/apple-authentication/).

Add dependency:

```shell {% showCopy=true %}
npx expo install expo-apple-authentication
```

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

Go to Instant dashboard → Auth tab → Redirect Origins → Add an origin.

Add `exp://` for development with Expo.

Authenticate with Apple and then pass identityToken to Instant along with `clientName` from Step 4:

```javascript {% showCopy=true %}
const [nonce] = useState('' + Math.random());
try {
  // sign in with Apple
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: nonce,
  });

  // pass identityToken to Instant
  db.auth
    .signInWithIdToken({
      clientName: '<clientName>',
      idToken: credential.identityToken,
      nonce: nonce,
    })
    .catch((err) => {
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

Sign out code:

```javascript {% showCopy=true %}
<Button
  title="Sign Out"
  onPress={async () => {
    await db.auth.signOut();
  }}
/>
```

Full example:

```javascript {% showCopy=true %}
import React, { useState } from 'react';
import { Button, View, Text, StyleSheet } from 'react-native';
import { init, tx } from '@instantdb/react-native';
import * as AppleAuthentication from 'expo-apple-authentication';

const APP_ID = '__APP_ID__';
const db = init({ appId: APP_ID });

export default function App() {
  const { isLoading, user, error } = db.useAuth();
  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.container}>
        <Text>Uh oh! {error.message}</Text>
      </View>
    );
  }
  if (user) {
    return (
      <View style={styles.container}>
        <Text>Hello {user.email}!</Text>
        <Button
          title="Sign Out"
          onPress={async () => {
            await db.auth.signOut();
          }}
        />
      </View>
    );
  }
  return <Login />;
}

function Login() {
  const [nonce] = useState('' + Math.random());
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
              nonce: nonce,
            });
            // signed in
            db.auth
              .signInWithIdToken({
                clientName: 'apple',
                idToken: credential.identityToken,
                nonce: nonce,
              })
              .catch((err) => {
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

{% /nav-default %}
