---
title: 'Build your own Zod'
date: '2024-09-26'
author: markyfyi
---

## Concepts

### 1. The `typeof` operator

### 2. Mapped types

```ts
type OriginalType = {
  stringy: {
    nestedType: string;
  };
  numbery: {
    nestedType: number;
  };
};

type MappedNestedType = {
  [Key in keyof OriginalType]: OriginalType[Key]['nestedType'];
};

// NestedStringType = string, not { nestedType: string; }
type NestedStringType = MappedNestedType['stringy'];
```

### 3. Generics

```ts
type ArrayOfNumbers = number[]; // or `Array<number>`
type BoolPromise = Promise<boolean>;
```

```ts
type Box<Param> = {
  param: Param;
};

type BoxedString = Box<string>;
```

```ts
type Box<Param extends string> = {
  param: Param;
};

type Boxed = Box<'hello!'>;
```

### 4. Conditional types and the `extends` keyword

```ts
type Box<Param> = {
  param: Param;
};

type IsBox<BoxedParam> = BoxedParam extends Box<any> ? true : false;

type IsBoxResult = IsBox<Box<string>>; // => true
```

### 5. The `infer` keyword and `never` type

```ts
type Box<Param extends string> = {
  param: Param;
};

type Unbox<BoxedParam> = BoxedParam extends Box<infer Param> ? Param : never;

type Unboxed = Unbox<Box<'hello!'>>; // => 'hello!'
```

```ts
type Box<Param extends string> = {
  param: Param;
};

type Unbox<BoxedParam> = BoxedParam extends Box<infer Param> ? Param : never;

type Unboxed = Unbox<Box<'hello!'>>;
```

```ts
// arrays!
type ArrayItem<ArrayType> =
  ArrayType extends Array<infer ItemType> ? ItemType : never;
type ItemType = ArrayItem<number[]>;

// promises!
type PromiseResult<PromiseType> =
  PromiseType extends Promise<infer ResultType> ? ResultType : never;
type ResultType = PromiseResult<Promise<string>>;

// even functions
type RunctionReturn<FunctionType> = FunctionType extends (
  ...args: any[]
) => infer ReturnType
  ? ReturnType
  : never;
type ReturnType = RunctionReturn<(arg: any) => boolean>;
```

## Building the schema builder!

### An `Attribute` type

```ts
class Attribute<ValueType> {
  constructor(public valueType: ValueType) {}
}
```

```ts
function string() {
  return new Attribute<string>('');
}

function number() {
  return new Attribute<number>(0);
}

function bool() {
  return new Attribute<boolean>(true);
}

const i = { string, number, bool };
```

```ts
type ResolveAttribute<AttributeType> =
  AttributeType extends Attribute<infer ValueType> ? ValueType : never;
```

```ts
const attr = i.string();

type ResolvedAttributeValueType = ResolveAttribute<typeof attr>; // => string
```

### An `Entity` type

```ts
class Entity<Attrs extends AttributesDef> {
  constructor(public attributes: Attrs) {}
}

function entity<Attrs extends AttributesDef>(attributes: Attrs) {
  return new Entity(attributes);
}
```

```ts
const user = i.entity({
  name: i.string(),
  age: i.number(),
  isAdmin: i.bool(),
});

user.attributes.name.valueType; // => string
user.attributes.age.valueType; // => number
```

But wait, we want both runtime and compile-time types!

We can obtain the resolved type by combining all the recipes in our bag of TypeScript tricks: generic extraction, inference, and mapped types.

```ts
type ResolveAtrributes<EntityType extends Entity<any>> = {
  [Key in keyof EntityType['attributes']]: ResolveAttribute<
    EntityType['attributes'][Key]
  >;
};

type ResolveEntity<EntityType> =
  EntityType extends Entity<AttributesDef>
    ? ResolveAtrributes<EntityType>
    : never;
```

```ts
type User = ResolveEntity<typeof user>;
/* => {
    name: string;
    age: number;
    isAdmin: boolean;
} */
```

### Attribute modifiers

```ts
class Attribute<ValueType, IsRequired extends boolean> {
  constructor(
    public valueType: ValueType,
    public isRequired: IsRequired,
  ) {}

  optional() {
    return new Attribute<ValueType, false>(this.valueType, false);
  }
}
```

```ts
type ResolveAttribute<AttributeType> =
  AttributeType extends Attribute<infer ValueType, infer IsRequired>
    ? IsRequired extends true
      ? ValueType
      : ValueType | undefined
    : never;
```

```ts
const user = i.entity({
  name: i.string(),
  age: i.number().optional(),
  isAdmin: i.bool(),
});

type User = ResolveEntity<typeof user>; /* => {
    name: string;
    age: number | undefined; // optional!
    isAdmin: boolean;
} */
```

Let's put it all together!

```ts
class Attribute<ValueType, IsRequired extends boolean> {
  constructor(
    public valueType: ValueType,
    public isRequired: IsRequired,
  ) {}

  optional() {
    return new Attribute<ValueType, false>(this.valueType, false);
  }
}

type AttributesDef = Record<string, Attribute<any, any>>;

function string() {
  return new Attribute<string, true>('', true);
}

function number() {
  return new Attribute<number, true>(0, true);
}

function bool() {
  return new Attribute<boolean, true>(true, true);
}

type ResolveAttribute<AttributeType> =
  AttributeType extends Attribute<infer ValueType, infer IsRequired>
    ? IsRequired extends true
      ? ValueType
      : ValueType | undefined
    : never;

class Entity<Attrs extends AttributesDef> {
  constructor(public attributes: Attrs) {}
}

function entity<Attrs extends AttributesDef>(attributes: Attrs) {
  return new Entity(attributes);
}

type ResolveAtrributes<EntityType extends Entity<any>> = {
  [Key in keyof EntityType['attributes']]: ResolveAttribute<
    EntityType['attributes'][Key]
  >;
};

type ResolveEntity<EntityType> =
  EntityType extends Entity<AttributesDef>
    ? ResolveAtrributes<EntityType>
    : never;

const i = {
  entity,
  string,
  number,
  bool,
};

export { i, type ResolveEntity };
```
