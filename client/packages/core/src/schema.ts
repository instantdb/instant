import type { RoomSchemaShape } from "./presence";

export {
  // constructs
  graph,
  entity,
  // value types
  string,
  number,
  boolean,
  json,
  any,
  // types
  type InstantGraph,
  type EntitiesDef,
  type LinkDef,
  type LinksDef,
  type LinkAttrDef,
  type DataAttrDef,
  type EntityDef,
  type ResolveAttrs,
};

// ==========
// API

/**
 * Accepts entities and links and merges them into a single graph definition.
 *
 * @see https://instantdb.com/docs/schema#defining-entities
 * @example
 *   export default i.graph(
 *     APP_ID,
 *     {
 *       posts: i.entity({
 *         title: i.string(),
 *         body: i.string(),
 *       }),
 *       comments: i.entity({
 *         body: i.string(),
 *       }),
 *     },
 *     {
 *       postsComments: {
 *         forward: {
 *           on: "posts",
 *           has: "many",
 *           label: "comments",
 *         },
 *         reverse: {
 *           on: "comments",
 *           has: "one",
 *           label: "post",
 *         },
 *       },
 *     },
 *   );
 */
function graph<
  EntitiesWithoutLinks extends EntitiesDef,
  const Links extends LinksDef<EntitiesWithoutLinks>,
>(appId: string, entities: EntitiesWithoutLinks, links: Links) {
  return new InstantGraph(
    appId,
    enrichEntitiesWithLinks<EntitiesWithoutLinks, Links>(entities, links),
    // (XXX): LinksDef<any> stems from TypeScript’s inability to reconcile the
    // type EntitiesWithLinks<EntitiesWithoutLinks, Links> with
    // EntitiesWithoutLinks. TypeScript is strict about ensuring that types are
    // correctly aligned and does not allow for substituting a type that might
    // be broader or have additional properties.
    links as LinksDef<any>,
  );
}

/**
 * Creates an entity definition, to be used in conjunction with `i.graph`.
 *
 * @see https://instantdb.com/docs/schema
 * @example
 *   {
 *     posts: i.entity({
 *       title: i.string(),
 *       body: i.string(),
 *     }),
 *     comments: i.entity({
 *       body: i.string(),
 *     })
 *   }
 */
function entity<Attrs extends AttrsDefs>(
  attrs: Attrs,
): EntityDef<Attrs, {}, void> {
  return new EntityDef(attrs, {});
}

function string<T extends string = string>(): DataAttrDef<T, true> {
  return new DataAttrDef("string", true);
}

function number(): DataAttrDef<number, true> {
  return new DataAttrDef("number", true);
}

function boolean(): DataAttrDef<boolean, true> {
  return new DataAttrDef("boolean", true);
}

function json<T = any>(): DataAttrDef<T, true> {
  return new DataAttrDef("json", true);
}

function any(): DataAttrDef<JSONValue, true> {
  return new DataAttrDef("json", true);
}

// ==========
// internal

function enrichEntitiesWithLinks<
  EntitiesWithoutLinks extends EntitiesDef,
  Links extends LinksDef<any>,
  EnrichedEntities = EntitiesWithLinks<EntitiesWithoutLinks, Links>,
>(entities: EntitiesWithoutLinks, links: Links): EnrichedEntities {
  const linksIndex: LinksIndex = { fwd: {}, rev: {} };

  for (const linkDef of Object.values(links)) {
    linksIndex.fwd[linkDef.forward.on as string] ||= {};
    linksIndex.rev[linkDef.reverse.on as string] ||= {};

    linksIndex.fwd[linkDef.forward.on as string][linkDef.forward.label] = {
      entityName: linkDef.reverse.on as string,
      cardinality: linkDef.forward.has,
    };

    linksIndex.rev[linkDef.reverse.on as string][linkDef.reverse.label] = {
      entityName: linkDef.forward.on as string,
      cardinality: linkDef.reverse.has,
    };
  }

  const enrichedEntities = Object.fromEntries(
    Object.entries(entities).map(([name, def]) => [
      name,
      new EntityDef(def.attrs, {
        ...linksIndex.fwd[name],
        ...linksIndex.rev[name],
      }),
    ]),
  );

  return enrichedEntities as EnrichedEntities;
}

class LinkAttrDef<
  Cardinality extends CardinalityKind,
  EntityName extends string,
> {
  constructor(
    public entityName: EntityName,
    public cardinality: Cardinality,
  ) {}
}

class DataAttrDef<ValueType, IsRequired extends boolean> {
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

class InstantGraph<
  Entities extends EntitiesDef,
  Links extends LinksDef<Entities>,
  RoomSchema extends RoomSchemaShape = {},
> {
  constructor(
    public appId: string,
    public entities: Entities,
    public links: Links,
  ) {}

  withRoomSchema<_RoomSchema extends RoomSchemaShape>() {
    return new InstantGraph<Entities, Links, _RoomSchema>(
      this.appId,
      this.entities,
      this.links,
    );
  }
}

// ==========
// base types

type LinksIndex = Record<
  "fwd" | "rev",
  Record<string, Record<string, { entityName: string; cardinality: string }>>
>;

type ValueTypes = "string" | "number" | "boolean" | "json";

type CardinalityKind = "one" | "many";

type JSONValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JSONValue }
  | JSONValue[];

type AttrsDefs = Record<string, DataAttrDef<any, any>>;

class EntityDef<
  Attrs extends AttrsDefs,
  Links extends Record<string, LinkAttrDef<any, any>>,
  AsType,
> {
  constructor(
    public attrs: Attrs,
    public links: Links,
  ) {}

  asType<_AsType>() {
    return new EntityDef<Attrs, Links, _AsType>(this.attrs, this.links);
  }
}

type EntitiesDef = Record<string, EntityDef<any, any, any>>;

type LinksDef<Entities extends EntitiesDef> = Record<
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

type LinkDef<
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

type EntitiesWithLinks<
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

type ResolveAttrs<
  Entities extends EntitiesDef,
  EntityName extends keyof Entities,
  ResolvedAttrs = {
    [AttrName in keyof Entities[EntityName]["attrs"]]: Entities[EntityName]["attrs"][AttrName] extends DataAttrDef<
      infer ValueType,
      infer IsRequired
    >
      ? IsRequired extends true
        ? ValueType
        : ValueType | undefined
      : never;
  },
> =
  Entities[EntityName] extends EntityDef<any, any, infer AsType>
    ? AsType extends void
      ? ResolvedAttrs
      : AsType
    : ResolvedAttrs;
