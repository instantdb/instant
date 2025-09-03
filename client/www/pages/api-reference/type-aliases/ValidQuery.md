[**@instantdb/react**](../README.md)

***

[@instantdb/react](../packages.md) / ValidQuery

# Type Alias: ValidQuery\<Q, S\>

```ts
type ValidQuery<Q, S> = S extends InstantUnknownSchemaDef ? InstaQLParams<S> : keyof Q extends keyof S["entities"] ? { [K in keyof S["entities"]]?: ValidQueryObject<Q[K], S, K, true> } : never;
```

Defined in: core/dist/esm/queryTypes.d.ts:255

## Type Parameters

### Q

`Q` *extends* `object`

### S

`S` *extends* `IContainEntitiesAndLinks`\<`any`, `any`\>
