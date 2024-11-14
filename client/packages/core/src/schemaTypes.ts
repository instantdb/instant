import type { RoomSchemaShape } from "./presence";

export class DataAttrDef<ValueType, IsRequired extends boolean> {
  constructor(
    public valueType: ValueTypes,
    public required: IsRequired,
    public config: {
      indexed: boolean;
      unique: boolean;
      // clientValidator?: (value: ValueType) => boolean;
    } = { indexed: false, unique: false },
  ) {}

  optional() {
    return new DataAttrDef<ValueType, false>(this.valueType, false);
  }

  unique() {
    return new DataAttrDef<ValueType, IsRequired>(
      this.valueType,
      this.required,
      {
        ...this.config,
        unique: true,
      },
    );
  }

  indexed() {
    return new DataAttrDef<ValueType, IsRequired>(
      this.valueType,
      this.required,
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

type ExtractValueType<T> =
  T extends DataAttrDef<infer ValueType, infer isRequired>
    ? isRequired extends true
      ? ValueType
      : ValueType | undefined
    : never;

export class LinkAttrDef<
  Cardinality extends CardinalityKind,
  EntityName extends string,
> {
  constructor(
    public cardinality: Cardinality,
    public entityName: EntityName,
  ) {}
}

export interface IInstantDataSchema<
  Entities extends EntitiesDef,
  Links extends LinksDef<Entities>,
> {
  entities: Entities;
  links: Links;
}

export class InstantGraph<
  Entities extends EntitiesDef,
  Links extends LinksDef<Entities>,
  RoomSchema extends RoomSchemaShape = {},
> implements IInstantDataSchema<Entities, Links>
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

// ==========
// base types

export type ValueTypes = "string" | "number" | "boolean" | "date" | "json";

export type CardinalityKind = "one" | "many";

export type AttrsDefs = Record<string, DataAttrDef<any, any>>;

export class EntityDef<
  Attrs extends AttrsDefs,
  Links extends Record<string, LinkAttrDef<any, any>>,
  AsType,
> {
  constructor(
    public attrs: Attrs,
    public links: Links,
  ) {}

  asType<
    _AsType extends Partial<{
      [AttrName in keyof Attrs]: ExtractValueType<Attrs[AttrName]>;
    }>,
  >() {
    return new EntityDef<Attrs, Links, _AsType>(this.attrs, this.links);
  }
}

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
  };
  reverse: {
    on: RevEntity;
    label: RevAttr;
    has: RevCardinality;
  };
};

// ==========
// derived types

export type EntitiesWithLinks<
  Entities extends EntitiesDef,
  Links extends LinksDef<Entities>,
> = {
  [EntityName in keyof Entities]: EntityDef<
    Entities[EntityName]["attrs"],
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
  LinkIndexFwd = LinksIndexedByEntity<Entities, Links, "reverse">,
> = EntityName extends keyof LinkIndexFwd
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
  RevLinkIndex = LinksIndexedByEntity<Entities, Links, "forward">,
> = EntityName extends keyof RevLinkIndex
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
  Direction extends "forward" | "reverse",
> = {
  [FwdEntity in keyof Entities]: {
    [LinkName in keyof Links as Links[LinkName][Direction]["on"] extends FwdEntity
      ? Links[LinkName][Direction]["label"]
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

export type ResolveEntityAttrs<
  EDef extends EntityDef<any, any, any>,
  ResolvedAttrs = {
    [AttrName in keyof EDef["attrs"]]: ExtractValueType<
      EDef["attrs"][AttrName]
    >;
  },
> =
  EDef extends EntityDef<any, any, infer AsType>
    ? AsType extends void
      ? ResolvedAttrs
      : Omit<ResolvedAttrs, keyof AsType> & AsType
    : ResolvedAttrs;

export type ResolveAttrs<
  Entities extends EntitiesDef,
  EntityName extends keyof Entities,
> = ResolveEntityAttrs<Entities[EntityName]>;

export type RoomsFromDef<RDef extends RoomsDef> = {
  [RoomName in keyof RDef]: {
    presence: ResolveEntityAttrs<RDef[RoomName]["presence"]>;
    topics: {
      [TopicName in keyof RDef[RoomName]["topics"]]: ResolveEntityAttrs<
        RDef[RoomName]["topics"][TopicName]
      >;
    };
  };
};

export type RoomsOf<S> =
  S extends InstantGraph<any, any, infer R>
    ? R extends RoomSchemaShape
      ? R
      : never
    : S extends DoNotUseInstantSchema<any, any, infer RDef>
      ? RoomsFromDef<RDef>
      : never;

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

export class DoNotUseInstantSchema<
  Entities extends EntitiesDef,
  Links extends LinksDef<Entities>,
  Rooms extends RoomsDef,
> implements IInstantDataSchema<Entities, Links>
{
  constructor(
    public entities: Entities,
    public links: Links,
    public rooms: Rooms,
  ) {}
}

export type UnknownEntity = EntityDef<
  {
    id: DataAttrDef<string, true>;
    [AttrName: string]: DataAttrDef<unknown, any>;
  },
  { [LinkName: string]: LinkAttrDef<"many", string> },
  void
>;

export type DoNotUseUnknownEntities = {
  [EntityName: string]: UnknownEntity;
};

export type DoNotUseUnknownLinks<Entities extends EntitiesDef> = {
  [LinkName: string]: LinkDef<
    Entities,
    string,
    string,
    "many",
    string,
    string,
    "many"
  >;
};

export type DoNotUseUnknownRooms = {
  [RoomName: string]: {
    presence: EntityDef<any, any, any>;
    topics: {
      [TopicName: string]: EntityDef<any, any, any>;
    };
  };
};

export type DoNotUseUnknownSchema = DoNotUseInstantSchema<
  DoNotUseUnknownEntities,
  DoNotUseUnknownLinks<DoNotUseUnknownEntities>,
  DoNotUseUnknownRooms
>;
