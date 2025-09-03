[**@instantdb/react**](../README.md)

***

[@instantdb/react](../packages.md) / InstaQLFields

# Type Alias: InstaQLFields\<S, K\>

```ts
type InstaQLFields<S, K> = (
  | Extract<keyof ResolveEntityAttrs<S["entities"][K]>, string>
  | "id")[];
```

Defined in: core/dist/esm/queryTypes.d.ts:152

## Type Parameters

### S

`S` *extends* `IContainEntitiesAndLinks`\<`any`, `any`\>

### K

`K` *extends* keyof `S`\[`"entities"`\]
