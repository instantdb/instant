[**@instantdb/react**](../README.md)

***

[@instantdb/react](../packages.md) / init

# Function: init()

```ts
function init<Schema, UseDates>(config): InstantReactWebDatabase<Schema, InstantConfig<Schema, UseDates>>;
```

Defined in: [react/src/init.ts:30](https://github.com/instantdb/instant/blob/08c469b2e32b424ee675d98f809302a6adacee95/client/packages/react/src/init.ts#L30)

The first step: init your application!

Visit https://instantdb.com/dash to get your `appId` :)

## Type Parameters

### Schema

`Schema` *extends* [`InstantSchemaDef`](../interfaces/InstantSchemaDef.md)\<`any`, `any`, `any`\> = [`InstantUnknownSchemaDef`](../interfaces/InstantUnknownSchemaDef.md)

### UseDates

`UseDates` *extends* `boolean` = `false`

## Parameters

### config

[`InstantConfig`](../type-aliases/InstantConfig.md)\<`Schema`, `UseDates`\>

## Returns

[`InstantReactWebDatabase`](../classes/InstantReactWebDatabase.md)\<`Schema`, [`InstantConfig`](../type-aliases/InstantConfig.md)\<`Schema`, `UseDates`\>\>

## Example

```ts
import { init } from "@instantdb/react"

 const db = init({ appId: "my-app-id" })

 // You can also provide a schema for type safety and editor autocomplete!

 import { init } from "@instantdb/react"
 import schema from ""../instant.schema.ts";

 const db = init({ appId: "my-app-id", schema })

 // To learn more: https://instantdb.com/docs/modeling-data
```
