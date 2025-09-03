[**@instantdb/react**](../README.md)

***

[@instantdb/react](../packages.md) / InstantRules

# Type Alias: InstantRules\<Schema\>

```ts
type InstantRules<Schema> = object & { [EntityName in keyof Schema["entities"]]: { allow: InstantRulesAllowBlock; bind?: string[] } };
```

Defined in: core/dist/esm/rulesTypes.d.ts:17

## Type Declaration

### $default?

```ts
optional $default: object;
```

#### $default.allow

```ts
allow: InstantRulesAllowBlock;
```

#### $default.bind?

```ts
optional bind: string[];
```

### attrs?

```ts
optional attrs: object;
```

#### attrs.allow

```ts
allow: InstantRulesAttrsAllowBlock;
```

#### attrs.bind?

```ts
optional bind: string[];
```

## Type Parameters

### Schema

`Schema` *extends* [`InstantSchemaDef`](../interfaces/InstantSchemaDef.md)\<`any`, `any`, `any`\> = [`InstantUnknownSchema`](InstantUnknownSchema.md)
