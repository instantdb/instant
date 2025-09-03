[**@instantdb/react**](../README.md)

***

[@instantdb/react](../packages.md) / EntityDef

# Interface: EntityDef\<Attrs, Links, AsType\>

Defined in: core/dist/esm/schemaTypes.d.ts:39

## Type Parameters

### Attrs

`Attrs` *extends* [`AttrsDefs`](../type-aliases/AttrsDefs.md)

### Links

`Links` *extends* `Record`\<`string`, [`LinkAttrDef`](LinkAttrDef.md)\<`any`, `any`\>\>

### AsType

`AsType`

## Properties

### attrs

```ts
attrs: Attrs;
```

Defined in: core/dist/esm/schemaTypes.d.ts:40

***

### links

```ts
links: Links;
```

Defined in: core/dist/esm/schemaTypes.d.ts:41

## Methods

### asType()

```ts
asType<_AsType>(): EntityDef<Attrs, Links, _AsType>;
```

Defined in: core/dist/esm/schemaTypes.d.ts:43

#### Type Parameters

##### _AsType

`_AsType` *extends* `Partial`\<`MappedAttrs`\<`Attrs`, `boolean`\>\>

#### Returns

`EntityDef`\<`Attrs`, `Links`, `_AsType`\>
