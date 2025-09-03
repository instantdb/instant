[**@instantdb/react**](../README.md)

***

[@instantdb/react](../packages.md) / lookup

# Function: lookup()

```ts
function lookup(attribute, value): string;
```

Defined in: core/dist/esm/instatx.d.ts:110

Creates a lookup to use in place of an id in a transaction

## Parameters

### attribute

`string`

### value

`any`

## Returns

`string`

## Example

```ts
db.tx.users[lookup('email', 'lyndon@example.com')].update({name: 'Lyndon'})
```
