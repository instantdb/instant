[**@instantdb/react**](../README.md)

***

[@instantdb/react](../packages.md) / Cursors

# Function: Cursors()

```ts
function Cursors<RoomSchema, RoomType>(__namedParameters): DetailedReactHTMLElement<InputHTMLAttributes<HTMLInputElement>, HTMLInputElement>;
```

Defined in: [react/src/Cursors.tsx:11](https://github.com/instantdb/instant/blob/08c469b2e32b424ee675d98f809302a6adacee95/client/packages/react/src/Cursors.tsx#L11)

## Type Parameters

### RoomSchema

`RoomSchema` *extends* `RoomSchemaShape`

### RoomType

`RoomType` *extends* `string` \| `number` \| `symbol`

## Parameters

### \_\_namedParameters

#### as?

`any` = `'div'`

#### children?

`ReactNode`

#### className?

`string`

#### propagate?

`boolean`

#### renderCursor?

(`props`) => `ReactNode`

#### room

`InstantReactRoom`\<`any`, `RoomSchema`, `RoomType`\>

#### spaceId?

`string`

#### style?

`CSSProperties`

#### userCursorColor?

`string`

#### zIndex?

`number`

## Returns

`DetailedReactHTMLElement`\<`InputHTMLAttributes`\<`HTMLInputElement`\>, `HTMLInputElement`\>
