---
title: Auth
description: Instant supports magic code, OAuth, Clerk, and custom auth.
---

Instant comes with support for auth. We currently offer [magic codes](/docs/auth/magic-codes), [Google OAuth](/docs/auth/google-oauth), [Sign In with Apple](/docs/auth/apple), and [Clerk](/docs/auth/clerk). If you want to build your own flow, you can use the [Admin SDK](/docs/backend#custom-auth).

## `<SignedIn />`, `<SignedOut />`, and `useUser()`

You can use the `<SignedIn />` and `<SignedOut />` components to structure your application.
Both components accept optional `loading` and `error`.

```tsx
export default function App() {
  return (
    <div>
      <db.SignedIn>
        <Dashboard />
      </db.SignedIn>
      <db.SignedOut>
        <LoginPage />
      </db.SignedOut>
    </div>
  );
}

function Dashboard() {
  const user = db.useUser();

  return <div>Signed in as: {user.email}</div>;
}
```

The `useUser` hook will throw an error if it is accessed while the user is not logged in, so it should be gated behind `<SignedIn>` or your own custom logic.

## Sign out

```javascript
db.auth.signOut();
```

Use `auth.signOut` from the client to invalidate the user's refresh token and
sign them out. You can also use the admin SDK to sign out the user [from the
server](/docs/backend#sign-out).

## Authentication Methods

{% nav-group margin=false %}
{% nav-button href="/docs/auth/magic-codes"
            title="Magic Codes"
            description="Send login codes to your users via email. Removes the need for passwords!"
            /%}
{% nav-button href="/docs/auth/google-oauth"
            title="Google OAuth"
            description="We provide flows for Web and React Native to enable Google OAuth for your app."
            /%}
{% nav-button href="/docs/auth/apple"
            title="Sign In with Apple"
            description="Sign In to native apps with Apple ID."
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

## Low Level API

### useAuth

```javascript
function App() {
  const { isLoading, user, error } = db.useAuth();
  if (isLoading) {
    return;
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

Use `useAuth` to fetch the current user. Here we guard against loading
our `Main` component until a user is logged in

### Get auth

```javascript
const user = await db.getAuth();
console.log('logged in as', user.email);
```

For scenarios where you want to know the current auth state without subscribing
to changes, you can use `getAuth`.
