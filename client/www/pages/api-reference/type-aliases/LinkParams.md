[**@instantdb/react**](../README.md)

***

[@instantdb/react](../packages.md) / LinkParams

# Type Alias: LinkParams\<Schema, EntityName\>

```ts
type LinkParams<Schema, EntityName> = { [LinkName in keyof Schema["entities"][EntityName]["links"]]?: Schema["entities"][EntityName]["links"][LinkName] extends LinkAttrDef<infer Cardinality, any> ? Cardinality extends "one" ? string : string | string[] : never };
```

Defined in: core/dist/esm/schemaTypes.d.ts:235

## Type Parameters

### Schema

`Schema` *extends* `IContainEntitiesAndLinks`\<`any`, `any`\>

### EntityName

`EntityName` *extends* keyof `Schema`\[`"entities"`\]
