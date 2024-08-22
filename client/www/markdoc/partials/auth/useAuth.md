## useAuth

```javascript
function App() {
  const { isLoading, user, error } = db.useAuth();
  if (isLoading) {
    return <div>Loading...</div>;
  }
  if (error) {
    return <div>Uh oh! {error.message}</div>;
  }
  if (user) {
    return <Main />;
  }
  return <Login />;
}
```

Use `useAuth` to fetch the current user. Here we guard against loading
our `Main` component until a user is logged in
