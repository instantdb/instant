[**@instantdb/react**](../README.md)

***

[@instantdb/react](../packages.md) / AuthState

# Type Alias: AuthState

```ts
type AuthState = 
  | {
  error: undefined;
  isLoading: true;
  user: undefined;
}
  | {
  error: {
     message: string;
  };
  isLoading: false;
  user: undefined;
}
  | {
  error: undefined;
  isLoading: false;
  user: User | null;
};
```

Defined in: core/dist/esm/clientTypes.d.ts:15
