## useAuth

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
