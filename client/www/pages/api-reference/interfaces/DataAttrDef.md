[**@instantdb/react**](../README.md)

***

[@instantdb/react](../packages.md) / DataAttrDef

# Interface: DataAttrDef\<ValueType, IsRequired, IsIndexed\>

Defined in: core/dist/esm/schemaTypes.d.ts:3

## Type Parameters

### ValueType

`ValueType`

### IsRequired

`IsRequired` *extends* `RequirementKind`

### IsIndexed

`IsIndexed` *extends* `boolean`

## Properties

### config

```ts
config: object;
```

Defined in: core/dist/esm/schemaTypes.d.ts:7

#### indexed

```ts
indexed: boolean;
```

#### unique

```ts
unique: boolean;
```

***

### isIndexed

```ts
isIndexed: IsIndexed;
```

Defined in: core/dist/esm/schemaTypes.d.ts:6

***

### metadata

```ts
metadata: Record<string, unknown>;
```

Defined in: core/dist/esm/schemaTypes.d.ts:11

***

### required

```ts
required: IsRequired;
```

Defined in: core/dist/esm/schemaTypes.d.ts:5

***

### valueType

```ts
valueType: ValueTypes;
```

Defined in: core/dist/esm/schemaTypes.d.ts:4

## Methods

### ~~clientRequired()~~

```ts
clientRequired(): DataAttrDef<ValueType, true, IsIndexed>;
```

Defined in: core/dist/esm/schemaTypes.d.ts:21

#### Returns

`DataAttrDef`\<`ValueType`, `true`, `IsIndexed`\>

#### Deprecated

Only use this temporarily for attributes that you want
to treat as required in frontend code but can’t yet mark as required
and enforced for backend

***

### indexed()

```ts
indexed(): DataAttrDef<ValueType, IsRequired, true>;
```

Defined in: core/dist/esm/schemaTypes.d.ts:24

#### Returns

`DataAttrDef`\<`ValueType`, `IsRequired`, `true`\>

***

### optional()

```ts
optional(): DataAttrDef<ValueType, false, IsIndexed>;
```

Defined in: core/dist/esm/schemaTypes.d.ts:22

#### Returns

`DataAttrDef`\<`ValueType`, `false`, `IsIndexed`\>

***

### unique()

```ts
unique(): DataAttrDef<ValueType, IsRequired, IsIndexed>;
```

Defined in: core/dist/esm/schemaTypes.d.ts:23

#### Returns

`DataAttrDef`\<`ValueType`, `IsRequired`, `IsIndexed`\>
