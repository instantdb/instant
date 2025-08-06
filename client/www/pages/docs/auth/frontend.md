---
title: Frontend
description: Accessing information about auth on the client.
---

## <SignedIn /> and <SignedOut />

You can use the `<SignedIn />` and `<SignedOut />` components to gate parts of your application depending on authentication.

```typescriptreact
return (
  <db.SignedIn>
    <UserDisplay />
  </db.SignedIn>
  <db.SignedOut>
    <SignInPage />
  </db.SignedOut>
)
```

Alternative use:

```
const { SignedIn, SignedOut } = db;
//...
return (
  <SignedIn>
    <UserDisplay />
  </SignedIn>
  <SignedOut>
    <SignInPage />
  </SignedOut>
)
```

## useUser

The `useUser()` hook will get the currently signed in user.
If the user is not signed in, an error will be thrown so it is best to gate any use of `useUser` behind the `<SignedIn />` component or your own custom logic.

```tsx
function UserDisplay() {
  const user = db.useUser();
  return <div>Logged in as: {user.email}</div>;
}
```

## Sign out

```javascript
db.auth.signOut();
```

Use `auth.signOut` from the client to invalidate the user's refresh token and
sign them out.You can also use the admin SDK to sign out the user [from the
server](/docs/backend#sign-out).

## Lower Level APIs

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
