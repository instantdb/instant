[**@instantdb/react**](../README.md)

***

[@instantdb/react](../packages.md) / RoomsOf

# Type Alias: RoomsOf\<S\>

```ts
type RoomsOf<S> = S extends InstantSchemaDef<any, any, infer RDef> ? RoomsFromDef<RDef> : never;
```

Defined in: core/dist/esm/schemaTypes.d.ts:112

## Type Parameters

### S

`S`
