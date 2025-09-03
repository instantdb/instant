[**@instantdb/react**](../README.md)

***

[@instantdb/react](../packages.md) / InstantSchema

# ~~Type Alias: InstantSchema\<DB\>~~

```ts
type InstantSchema<DB> = DB extends IInstantDatabase<infer Schema> ? Schema : never;
```

Defined in: core/dist/esm/helperTypes.d.ts:45

## Type Parameters

### DB

`DB` *extends* [`IInstantDatabase`](../interfaces/IInstantDatabase.md)\<`any`\>

## Deprecated

`InstantSchema` is deprecated. Use typeof schema directly:

## Example

```ts
// Before
const db = init_experimental({ ...config, schema });
type Schema = InstantSchema<typeof db>;

// After
type Schema = typeof schema;
```
