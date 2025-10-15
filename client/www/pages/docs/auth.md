---
title: Auth
description: Instant supports magic code, OAuth, Clerk, and custom auth.
---

Instant comes with support for auth. We currently offer [Magic Codes](/docs/auth/magic-codes), [Guest Auth](/docs/auth/guest-auth), [Google OAuth](/docs/auth/google-oauth), [Sign In with Apple](/docs/auth/apple), [Github OAuth](/docs/auth/github-oauth), [LinkedIn OAuth](/docs/auth/linkedin-oauth), and [Clerk](/docs/auth/clerk). If you want to build your own flow, you can use the [Admin SDK](/docs/backend#custom-auth).

## Auth Overview

To get the current user in your application, you can use the `db.useUser` hook.

```tsx
import db from '../lib/db';

function Dashboard() {
  const user = db.useUser();

  return <div>Signed in as: {user.email}</div>;
}
```

The `useUser` hook will throw an error if it is accessed while the user is not logged in, so it should be gated behind `<db.SignedIn>`

```tsx
import db from '../lib/db';

export default function App() {
  return (
    <div>
      <db.SignedIn>
        <Dashboard />
      </db.SignedIn>
      <db.SignedOut>
        <div>Log in to see the dashboard!</div>
      </db.SignedOut>
    </div>
  );
}

function Dashboard() {
  // This component will only render if the user is signed in
  // so it's safe to call useUser here!
  const user = db.useUser();

  return <div>Signed in as: {user.email}</div>;
}
```

Use `<db.SignedIn>` and `<db.SignedOut>` to conditionally render components
based on the user's authentication state.

You can then use `db.auth.signOut()` to sign a user out.

```tsx
import db from '../lib/db';

// ... Same app component from above

function Dashboard() {
  const user = db.useUser();

  return (
    <div>
      <div>Signed in as: {user.email}</div>
      <button onClick={() => db.auth.signOut()}>Sign out</button>
    </div>
  );
}
```

Putting it all together, you can conditionally render a login and dashboard component
like so:

```tsx
import db from '../lib/db';

export default function App() {
  return (
    <div>
      <db.SignedIn>
        <Dashboard />
      </db.SignedIn>
      <db.SignedOut>
        <Login />
      </db.SignedOut>
    </div>
  );
}

function Dashboard() {
  // This component will only render if the user is signed in
  // so it's safe to call useUser here!
  const user = db.useUser();

  return <div>Signed in as: {user.email}</div>;
}

function Login() {
  // Implement a login flow here via magic codes, OAuth, Clerk, etc.
}
```

To implement a login flow use one of the authentication method guides below.

## Authentication Methods

{% nav-group margin=false %}
{% nav-button href="/docs/auth/magic-codes"
            title="Magic Codes"
            description="Send login codes to your users via email. Removes the need for passwords."
            /%}
{% nav-button href="/docs/auth/guest-auth"
            title="Guest Auth"
            description="Allow your users to try your app before they sign up."
            /%}
{% nav-button href="/docs/auth/google-oauth"
            title="Google OAuth"
            description="We provide flows for Web and React Native to enable Google OAuth for your app."
            /%}
{% nav-button href="/docs/auth/apple"
            title="Sign In with Apple"
            description="Sign In to native apps with Apple ID."
            /%}
{% nav-button href="/docs/auth/github-oauth"
            title="Github OAuth"
            description="Log in with Github on both Web and React Native."
            /%}
{% nav-button href="/docs/auth/linkedin-oauth"
            title="LinkedIn OAuth"
            description="Log in with LinkedIn on both Web and React Native."
            /%}
{% nav-button href="/docs/auth/clerk"
            title="Clerk"
            description="Integrate Clerk's auth flow with Instant."
            /%}
{% nav-button href="/docs/backend#custom-auth"
            title="Custom Auth"
            description="Integrate your own auth flow with the Admin SDK."
            /%}

{% /nav-group %}

## Additional Auth APIs

Sometimes you need finer control over the state of auth in your application. In those cases, you can use some of the lower-level API.

### useAuth

Use `useAuth` to fetch the current user. In this example we guard against loading
our `Main` component until a user is logged in

```javascript
function App() {
  const { isLoading, user, error } = db.useAuth();
  if (isLoading) {
    return null; // or a loading spinner
  }
  if (error) {
    return <div className="p-4 text-red-500">Uh oh! {error.message}</div>;
  }
  if (user) {
    return <Main />;
  }
  return <Login />;
}
```

### Get auth

For scenarios where you want to know the current auth state without subscribing
to changes, you can use `getAuth`.

```javascript
const user = await db.getAuth();
console.log('logged in as', user.email);
```
