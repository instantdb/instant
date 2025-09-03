[**@instantdb/react**](../README.md)

***

[@instantdb/react](../packages.md) / InstaQLParams

# Type Alias: InstaQLParams\<S\>

```ts
type InstaQLParams<S> = { [K in keyof S["entities"]]?: $Option<S, K> | $Option<S, K> & InstaQLQuerySubqueryParams<S, K> };
```

Defined in: core/dist/esm/queryTypes.d.ts:173

## Type Parameters

### S

`S` *extends* `IContainEntitiesAndLinks`\<`any`, `any`\>
