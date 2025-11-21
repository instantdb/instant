import type { RoomSchemaShape } from './presence.ts';
import { Expand } from './queryTypes.ts';

export class DataAttrDef<
  ValueType,
  IsRequired extends RequirementKind,
  IsIndexed extends boolean,
> {
  public metadata: Record<string, unknown> = {};

  constructor(
    public valueType: ValueTypes,
    public required: IsRequired,
    public isIndexed: IsIndexed,

    public config: {
      indexed: boolean;
      unique: boolean;
      // clientValidator?: (value: ValueType) => boolean;
    } = { indexed: false, unique: false },
  ) {}

  /**
   * @deprecated Only use this temporarily for attributes that you want
   * to treat as required in frontend code but can’t yet mark as required
   * and enforced for backend
   */
  clientRequired() {
    return new DataAttrDef<ValueType, true, IsIndexed>(
      this.valueType,
      false as unknown as true,
      this.isIndexed,
      this.config,
    );
  }

  optional() {
    return new DataAttrDef<ValueType, false, IsIndexed>(
      this.valueType,
      false,
      this.isIndexed,
      this.config,
    );
  }

  unique() {
    return new DataAttrDef<ValueType, IsRequired, IsIndexed>(
      this.valueType,
      this.required,
      this.isIndexed,
      {
        ...this.config,
        unique: true,
      },
    );
  }

  indexed() {
    return new DataAttrDef<ValueType, IsRequired, true>(
      this.valueType,
      this.required,
      true,
      {
        ...this.config,
        indexed: true,
      },
    );
  }

  // clientValidate(clientValidator: (value: ValueType) => boolean) {
  //   return new DataAttrDef(this.valueType, this.required, {
  //     ...this.config,
  //     clientValidator,
  //   });
  // }
}

export class LinkAttrDef<
  Cardinality extends CardinalityKind,
  EntityName extends string,
> {
  constructor(
    public cardinality: Cardinality,
    public entityName: EntityName,
  ) {}
}

export interface IContainEntitiesAndLinks<
  Entities extends EntitiesDef,
  Links extends LinksDef<Entities>,
> {
  entities: Entities;
  links: Links;
}

// ==========
// base types

export type ValueTypes = 'string' | 'number' | 'boolean' | 'date' | 'json';

export type CardinalityKind = 'one' | 'many';

// true  - force required
// false - optional, not required
export type RequirementKind = true | false;

export type AttrsDefs = Record<string, DataAttrDef<any, any, any>>;

export class EntityDef<
  Attrs extends AttrsDefs,
  Links extends Record<string, LinkAttrDef<any, any>>,
  AsType,
> {
  constructor(
    public attrs: Attrs,
    public links: Links,
  ) {}

  asType<_AsType extends Partial<MappedAttrs<Attrs, boolean>>>() {
    return new EntityDef<Attrs, Links, _AsType>(this.attrs, this.links);
  }
}

export type EntityDefFromSchema<
  S extends IContainEntitiesAndLinks<any, any>,
  K extends keyof S['entities'],
> = {
  [k in keyof S['entities'][K]['attrs']]: S['entities'][K] extends EntityDef<
    any,
    any,
    any
  >
    ? S['entities'][K]['attrs'][k]
    : never;
};

export type EntitiesDef = Record<string, EntityDef<any, any, any>>;

export type LinksDef<Entities extends EntitiesDef> = Record<
  string,
  LinkDef<
    Entities,
    keyof Entities,
    string,
    CardinalityKind,
    keyof Entities,
    string,
    CardinalityKind
  >
>;

export type LinkDef<
  Entities extends EntitiesDef,
  FwdEntity extends keyof Entities,
  FwdAttr extends string,
  FwdCardinality extends CardinalityKind,
  RevEntity extends keyof Entities,
  RevAttr extends string,
  RevCardinality extends CardinalityKind,
> = {
  forward: {
    on: FwdEntity;
    label: FwdAttr;
    has: FwdCardinality;
    required?: RequirementKind;
    onDelete?: 'cascade';
  };
  reverse: {
    on: RevEntity;
    label: RevAttr;
    has: RevCardinality;
    onDelete?: 'cascade';
  };
};

// ==========
// derived types
type IsEmptyOrIndexSignature<T> = keyof T extends never
  ? true
  : string extends keyof T
    ? true
    : false;

export type EntitiesWithLinks<
  Entities extends EntitiesDef,
  Links extends LinksDef<Entities>,
> = {
  [EntityName in keyof Entities]: EntityDef<
    Entities[EntityName]['attrs'],
    EntityForwardLinksMap<EntityName, Entities, Links> &
      EntityReverseLinksMap<EntityName, Entities, Links>,
    Entities[EntityName] extends EntityDef<any, any, infer O>
      ? O extends void
        ? void
        : O
      : void
  >;
};

type EntityForwardLinksMap<
  EntityName extends keyof Entities,
  Entities extends EntitiesDef,
  Links extends LinksDef<Entities>,
  LinkIndexFwd = LinksIndexedByEntity<Entities, Links, 'reverse'>,
> =
  IsEmptyOrIndexSignature<Links> extends true
    ? {}
    : EntityName extends keyof LinkIndexFwd
      ? {
          [LinkName in keyof LinkIndexFwd[EntityName]]: LinkIndexFwd[EntityName][LinkName] extends LinkDef<
            Entities,
            infer RelatedEntityName,
            any,
            any,
            any,
            any,
            infer Cardinality
          >
            ? {
                entityName: RelatedEntityName;
                cardinality: Cardinality;
              }
            : never;
        }
      : {};

type EntityReverseLinksMap<
  EntityName extends keyof Entities,
  Entities extends EntitiesDef,
  Links extends LinksDef<Entities>,
  RevLinkIndex = LinksIndexedByEntity<Entities, Links, 'forward'>,
> =
  IsEmptyOrIndexSignature<Links> extends true
    ? {}
    : EntityName extends keyof RevLinkIndex
      ? {
          [LinkName in keyof RevLinkIndex[EntityName]]: RevLinkIndex[EntityName][LinkName] extends LinkDef<
            Entities,
            any,
            any,
            infer Cardinality,
            infer RelatedEntityName,
            any,
            any
          >
            ? {
                entityName: RelatedEntityName;
                cardinality: Cardinality;
              }
            : never;
        }
      : {};

type LinksIndexedByEntity<
  Entities extends EntitiesDef,
  Links extends LinksDef<Entities>,
  Direction extends 'forward' | 'reverse',
> = {
  [FwdEntity in keyof Entities]: {
    [LinkName in keyof Links as Links[LinkName][Direction]['on'] extends FwdEntity
      ? Links[LinkName][Direction]['label']
      : never]: Links[LinkName] extends LinkDef<
      Entities,
      infer FwdEntity,
      infer FwdAttr,
      infer FwdCardinality,
      infer RevEntity,
      infer RevAttr,
      infer RevCardinality
    >
      ? LinkDef<
          Entities,
          FwdEntity,
          FwdAttr,
          FwdCardinality,
          RevEntity,
          RevAttr,
          RevCardinality
        >
      : never;
  };
};

type RequiredKeys<Attrs extends AttrsDefs> = {
  [K in keyof Attrs]: Attrs[K] extends DataAttrDef<any, infer R, any>
    ? R extends true
      ? K
      : never
    : never;
}[keyof Attrs];

type OptionalKeys<Attrs extends AttrsDefs> = {
  [K in keyof Attrs]: Attrs[K] extends DataAttrDef<any, infer R, any>
    ? R extends false
      ? K
      : never
    : never;
}[keyof Attrs];

/**
 * MappedAttrs:
 *   - Required keys => `key: ValueType`
 *   - Optional keys => `key?: ValueType`
 */
type MappedAttrs<Attrs extends AttrsDefs, UseDates extends boolean> = {
  [K in RequiredKeys<Attrs>]: Attrs[K] extends DataAttrDef<infer V, any, any>
    ? V extends Date
      ? UseDates extends true
        ? V
        : string | number
      : V
    : never;
} & {
  [K in OptionalKeys<Attrs>]?: Attrs[K] extends DataAttrDef<infer V, any, any>
    ? V extends Date
      ? UseDates extends true
        ? V
        : string | number
      : V
    : never;
};

export type ResolveEntityAttrs<
  EDef extends EntityDef<any, any, any>,
  UseDates extends boolean = false,
  ResolvedAttrs = MappedAttrs<EDef['attrs'], UseDates>,
> =
  EDef extends EntityDef<any, any, infer AsType>
    ? AsType extends void
      ? ResolvedAttrs
      : Omit<ResolvedAttrs, keyof AsType> & AsType
    : ResolvedAttrs;

export type ResolveAttrs<
  Entities extends EntitiesDef,
  EntityName extends keyof Entities,
  UseDates extends boolean,
> = ResolveEntityAttrs<Entities[EntityName], UseDates>;

export type RoomsFromDef<RDef extends RoomsDef> = {
  [RoomName in keyof RDef]: {
    presence: Expand<ResolveEntityAttrs<RDef[RoomName]['presence']>>;
    topics: {
      [TopicName in keyof RDef[RoomName]['topics']]: Expand<
        ResolveEntityAttrs<NonNullable<RDef[RoomName]['topics']>[TopicName]>
      >;
    };
  };
};

export type RoomsOf<S> =
  S extends InstantSchemaDef<any, any, infer RDef> ? RoomsFromDef<RDef> : never;

export type PresenceOf<
  S,
  RoomType extends keyof RoomsOf<S>,
> = RoomsOf<S>[RoomType] extends { presence: infer P } ? P : {};

export type TopicsOf<
  S,
  RoomType extends keyof RoomsOf<S>,
> = RoomsOf<S>[RoomType] extends { topics: infer T } ? T : {};

export type TopicOf<
  S,
  RoomType extends keyof RoomsOf<S>,
  TopicType extends keyof TopicsOf<S, RoomType>,
> = TopicsOf<S, RoomType>[TopicType];

interface RoomDef {
  presence: EntityDef<any, any, any>;
  topics?: {
    [TopicName: string]: EntityDef<any, any, any>;
  };
}

export interface RoomsDef {
  [RoomType: string]: RoomDef;
}

export class InstantSchemaDef<
  Entities extends EntitiesDef,
  Links extends LinksDef<Entities>,
  Rooms extends RoomsDef,
> implements IContainEntitiesAndLinks<Entities, Links>
{
  constructor(
    public entities: Entities,
    public links: Links,
    public rooms: Rooms,
  ) {}

  /**
   * @deprecated
   * `withRoomSchema` is deprecated. Define your schema in `rooms` directly:
   *
   * @example
   * // Before:
   * const schema = i.schema({
   *   // ...
   * }).withRoomSchema<RoomSchema>()
   *
   * // After
   * const schema = i.schema({
   *  rooms: {
   *    // ...
   *  }
   * })
   *
   * @see https://instantdb.com/docs/presence-and-topics#typesafety
   */
  withRoomSchema<_RoomSchema extends RoomSchemaShape>() {
    type RDef = RoomDefFromShape<_RoomSchema>;
    return new InstantSchemaDef<Entities, Links, RDef>(
      this.entities,
      this.links,
      {} as RDef,
    );
  }
}

/**
 * @deprecated
 * `i.graph` is deprecated. Use `i.schema` instead.
 *
 * @see https://instantdb.com/docs/modeling-data
 */
export class InstantGraph<
  Entities extends EntitiesDef,
  Links extends LinksDef<Entities>,
  RoomSchema extends RoomSchemaShape = {},
> implements IContainEntitiesAndLinks<Entities, Links>
{
  constructor(
    public entities: Entities,
    public links: Links,
  ) {}

  withRoomSchema<_RoomSchema extends RoomSchemaShape>() {
    return new InstantGraph<Entities, Links, _RoomSchema>(
      this.entities,
      this.links,
    );
  }
}

type EntityDefFromRoomSlice<Shape extends { [k: string]: any }> = EntityDef<
  {
    [AttrName in keyof Shape]: DataAttrDef<
      Shape[AttrName],
      Shape[AttrName] extends undefined ? false : true,
      any
    >;
  },
  any,
  void
>;

type RoomDefFromShape<RoomSchema extends RoomSchemaShape> = {
  [RoomName in keyof RoomSchema]: {
    presence: EntityDefFromRoomSlice<
      NonNullable<RoomSchema[RoomName]['presence']>
    >;
    topics: {
      [TopicName in keyof RoomSchema[RoomName]['topics']]: EntityDefFromRoomSlice<
        NonNullable<RoomSchema[RoomName]['topics'][TopicName]>
      >;
    };
  };
};

type EntityDefFromShape<Shape, K extends keyof Shape> = EntityDef<
  {
    [AttrName in keyof Shape[K]]: DataAttrDef<
      Shape[K][AttrName],
      Shape[K][AttrName] extends undefined ? false : true,
      any
    >;
  },
  {
    [LinkName in keyof Shape]: LinkAttrDef<
      'many',
      LinkName extends string ? LinkName : string
    >;
  },
  void
>;

/**
 * If you were using the old `schema` types, you can use this to help you
 * migrate.
 *
 * @example
 * // Before
 * const db = init<Schema, Rooms>({...})
 *
 * // After
 * const db = init<BackwardsCompatibleSchema<Schema, Rooms>>({...})
 */
export type BackwardsCompatibleSchema<
  Shape extends { [k: string]: any },
  RoomSchema extends RoomSchemaShape = {},
> = InstantSchemaDef<
  { [K in keyof Shape]: EntityDefFromShape<Shape, K> },
  UnknownLinks<EntitiesDef>,
  RoomDefFromShape<RoomSchema>
>;

// ----------
// InstantUnknownSchema

export type UnknownEntity = EntityDef<
  {
    id: DataAttrDef<string, true, true>;
    [AttrName: string]: DataAttrDef<any, boolean, boolean>;
  },
  { [LinkName: string]: LinkAttrDef<'many', string> },
  void
>;

export type UnknownEntities = {
  [EntityName: string]: UnknownEntity;
};

export interface UnknownLinks<Entities extends EntitiesDef> {
  [LinkName: string]: LinkDef<
    Entities,
    string,
    string,
    'many',
    string,
    string,
    'many'
  >;
}

export interface UnknownRooms {
  [RoomName: string]: {
    presence: EntityDef<any, any, any>;
    topics: {
      [TopicName: string]: EntityDef<any, any, any>;
    };
  };
}

export class InstantUnknownSchemaDef extends InstantSchemaDef<
  UnknownEntities,
  UnknownLinks<UnknownEntities>,
  UnknownRooms
> {}

export type InstantUnknownSchema = InstantUnknownSchemaDef;

export type CreateParams<
  Schema extends IContainEntitiesAndLinks<any, any>,
  EntityName extends keyof Schema['entities'],
> = {
  [AttrName in RequiredKeys<
    Schema['entities'][EntityName]['attrs']
  >]: Schema['entities'][EntityName]['attrs'][AttrName] extends DataAttrDef<
    infer ValueType,
    any,
    any
  >
    ? ValueType extends Date
      ? string | number | Date
      : ValueType
    : never;
} & {
  [AttrName in OptionalKeys<
    Schema['entities'][EntityName]['attrs']
  >]?: Schema['entities'][EntityName]['attrs'][AttrName] extends DataAttrDef<
    infer ValueType,
    false,
    any
  >
    ? (ValueType extends Date ? string | number | Date : ValueType) | null
    : never;
};

export type UpdateParams<
  Schema extends IContainEntitiesAndLinks<any, any>,
  EntityName extends keyof Schema['entities'],
> = {
  [AttrName in keyof Schema['entities'][EntityName]['attrs']]?: Schema['entities'][EntityName]['attrs'][AttrName] extends DataAttrDef<
    infer ValueType,
    infer IsRequired,
    any
  >
    ? IsRequired extends true
      ? ValueType extends Date
        ? string | number | Date
        : ValueType
      : (ValueType extends Date ? string | number | Date : ValueType) | null
    : never;
};

export type UpdateOpts = {
  upsert?: boolean | undefined;
};

export type LinkParams<
  Schema extends IContainEntitiesAndLinks<any, any>,
  EntityName extends keyof Schema['entities'],
> = {
  [LinkName in keyof Schema['entities'][EntityName]['links']]?: Schema['entities'][EntityName]['links'][LinkName] extends LinkAttrDef<
    infer Cardinality,
    any
  >
    ? Cardinality extends 'one'
      ? string
      : string | string[]
    : never;
};

export type RuleParams = {
  [key: string]: any;
};
