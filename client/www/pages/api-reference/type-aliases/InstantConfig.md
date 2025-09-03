[**@instantdb/react**](../README.md)

***

[@instantdb/react](../packages.md) / InstantConfig

# Type Alias: InstantConfig\<S, UseDates\>

```ts
type InstantConfig<S, UseDates> = object;
```

Defined in: core/dist/esm/index.d.ts:33

## Type Parameters

### S

`S` *extends* [`InstantSchemaDef`](../interfaces/InstantSchemaDef.md)\<`any`, `any`, `any`\>

### UseDates

`UseDates` *extends* `boolean` = `false`

## Properties

### apiURI?

```ts
optional apiURI: string;
```

Defined in: core/dist/esm/index.d.ts:37

***

### appId

```ts
appId: string;
```

Defined in: core/dist/esm/index.d.ts:34

***

### devtool?

```ts
optional devtool: boolean | DevtoolConfig;
```

Defined in: core/dist/esm/index.d.ts:38

***

### disableValidation?

```ts
optional disableValidation: boolean;
```

Defined in: core/dist/esm/index.d.ts:42

***

### queryCacheLimit?

```ts
optional queryCacheLimit: number;
```

Defined in: core/dist/esm/index.d.ts:40

***

### schema?

```ts
optional schema: S;
```

Defined in: core/dist/esm/index.d.ts:35

***

### useDateObjects?

```ts
optional useDateObjects: UseDates;
```

Defined in: core/dist/esm/index.d.ts:41

***

### verbose?

```ts
optional verbose: boolean;
```

Defined in: core/dist/esm/index.d.ts:39

***

### websocketURI?

```ts
optional websocketURI: string;
```

Defined in: core/dist/esm/index.d.ts:36
