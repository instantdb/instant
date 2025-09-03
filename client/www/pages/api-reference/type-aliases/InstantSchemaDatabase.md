[**@instantdb/react**](../README.md)

***

[@instantdb/react](../packages.md) / InstantSchemaDatabase

# ~~Type Alias: InstantSchemaDatabase\<Schema, _T1, _T2\>~~

```ts
type InstantSchemaDatabase<Schema, _T1, _T2> = IInstantDatabase<Schema>;
```

Defined in: core/dist/esm/helperTypes.d.ts:75

## Type Parameters

### Schema

`Schema` *extends* [`InstantSchemaDef`](../interfaces/InstantSchemaDef.md)\<`any`, `any`, `any`\>

### _T1

`_T1` *extends* `any` = `any`

### _T2

`_T2` *extends* `any` = `any`

## Deprecated

`InstantSchemaDatabase` is deprecated. You generally don't need to
create a return type for a DB. But, if you like you can use `IInstantDatabase`:

## Example

```ts
// Before
type DB = InstantSchemaDatabase<typeof schema>;

// After
type DB = IInstantDatabase<typeof schema>;
```
