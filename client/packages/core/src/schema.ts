import {
  EntityDef,
  DataAttrDef,
  InstantSchemaDef,
  type EntitiesDef,
  type AttrsDefs,
  type EntitiesWithLinks,
  type LinksDef,
  type RoomsDef,
  type UnknownRooms,
} from './schemaTypes.ts';

// ==========
// API

/**
 * @deprecated
 * `i.graph` is deprecated. Use `i.schema` instead.
 *
 * @example
 * // Before
 * i.graph(entities, links).withRoomSchema<RoomType>();
 *
 * // After
 * i.schema({ entities, links, rooms })
 *
 * @see
 * https://instantdb.com/docs/modeling-data
 */
function graph<
  EntitiesWithoutLinks extends EntitiesDef,
  const Links extends LinksDef<EntitiesWithoutLinks>,
>(entities: EntitiesWithoutLinks, links: Links) {
  return new InstantSchemaDef(
    enrichEntitiesWithLinks<EntitiesWithoutLinks, Links>(entities, links),
    // (XXX): LinksDef<any> stems from TypeScript’s inability to reconcile the
    // type EntitiesWithLinks<EntitiesWithoutLinks, Links> with
    // EntitiesWithoutLinks. TypeScript is strict about ensuring that types are
    // correctly aligned and does not allow for substituting a type that might
    // be broader or have additional properties.
    links as LinksDef<any>,
    undefined as unknown as UnknownRooms,
  );
}

/**
 * Creates an entity definition, to be used in conjunction with `i.graph`.
 *
 * @see https://instantdb.com/docs/modeling-data
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

function string<StringEnum extends string = string>(): DataAttrDef<
  StringEnum,
  true,
  false
> {
  return new DataAttrDef('string', true, false);
}

function number(): DataAttrDef<number, true, false> {
  return new DataAttrDef('number', true, false);
}

function boolean(): DataAttrDef<boolean, true, false> {
  return new DataAttrDef('boolean', true, false);
}

function date(): DataAttrDef<Date, true, false> {
  return new DataAttrDef('date', true, false);
}

function json<T = any>(): DataAttrDef<T, true, false> {
  return new DataAttrDef('json', true, false);
}

function any(): DataAttrDef<any, true, false> {
  return new DataAttrDef('json', true, false);
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

type LinksIndex = Record<
  'fwd' | 'rev',
  Record<string, Record<string, { entityName: string; cardinality: string }>>
>;

/**
 * Lets you define a schema for your database.
 *
 * You can define entities, links between entities, and if you use
 * presence, you can define rooms.
 *
 * You can push this schema to your database with the CLI,
 * or use it inside `init`, to get typesafety and autocompletion.
 *
 * @see https://instantdb.com/docs/modeling-data
 * @example
 *   i.schema({
 *     entities: { },
 *     links: { },
 *     rooms: { }
 *   });
 */
function schema<
  EntitiesWithoutLinks extends EntitiesDef,
  const Links extends LinksDef<EntitiesWithoutLinks>,
  Rooms extends RoomsDef = {},
>({
  entities,
  links,
  rooms,
}: {
  entities: EntitiesWithoutLinks;
  links?: Links;
  rooms?: Rooms;
}) {
  const linksDef = (links ?? {}) as Links;
  const roomsDef = (rooms ?? {}) as Rooms;
  return new InstantSchemaDef(
    enrichEntitiesWithLinks<EntitiesWithoutLinks, Links>(entities, linksDef),
    // (XXX): LinksDef<any> stems from TypeScript's inability to reconcile the
    // type EntitiesWithLinks<EntitiesWithoutLinks, Links> with
    // EntitiesWithoutLinks. TypeScript is strict about ensuring that types are
    // correctly aligned and does not allow for substituting a type that might
    // be broader or have additional properties.
    linksDef as LinksDef<any>,
    roomsDef,
  );
}

export const i = {
  // constructs
  graph,
  schema,
  entity,
  // value types
  string,
  number,
  boolean,
  date,
  json,
  any,
};
