[**@instantdb/react**](../README.md)

***

[@instantdb/react](../packages.md) / LinkDef

# Type Alias: LinkDef\<Entities, FwdEntity, FwdAttr, FwdCardinality, RevEntity, RevAttr, RevCardinality\>

```ts
type LinkDef<Entities, FwdEntity, FwdAttr, FwdCardinality, RevEntity, RevAttr, RevCardinality> = object;
```

Defined in: core/dist/esm/schemaTypes.d.ts:50

## Type Parameters

### Entities

`Entities` *extends* [`EntitiesDef`](EntitiesDef.md)

### FwdEntity

`FwdEntity` *extends* keyof `Entities`

### FwdAttr

`FwdAttr` *extends* `string`

### FwdCardinality

`FwdCardinality` *extends* [`CardinalityKind`](CardinalityKind.md)

### RevEntity

`RevEntity` *extends* keyof `Entities`

### RevAttr

`RevAttr` *extends* `string`

### RevCardinality

`RevCardinality` *extends* [`CardinalityKind`](CardinalityKind.md)

## Properties

### forward

```ts
forward: object;
```

Defined in: core/dist/esm/schemaTypes.d.ts:51

#### has

```ts
has: FwdCardinality;
```

#### label

```ts
label: FwdAttr;
```

#### on

```ts
on: FwdEntity;
```

#### onDelete?

```ts
optional onDelete: "cascade";
```

#### required?

```ts
optional required: RequirementKind;
```

***

### reverse

```ts
reverse: object;
```

Defined in: core/dist/esm/schemaTypes.d.ts:58

#### has

```ts
has: RevCardinality;
```

#### label

```ts
label: RevAttr;
```

#### on

```ts
on: RevEntity;
```

#### onDelete?

```ts
optional onDelete: "cascade";
```
