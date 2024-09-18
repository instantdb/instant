import {
  EntityDef,
  DataAttrDef,
  InstantGraph,
  type EntitiesDef,
  type AttrsDefs,
  type EntitiesWithLinks,
  type LinksDef,
} from "./schemaTypes";

// ==========
// API

/**
 * Accepts entities and links and merges them into a single graph definition.
 *
 * @see https://instantdb.com/docs/schema#defining-entities
 * @example
 *   export default i.graph(
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
>(entities: EntitiesWithoutLinks, links: Links) {
  return new InstantGraph(
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

function string<StringEnum extends string = string>(): DataAttrDef<
  StringEnum,
  true
> {
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

function any(): DataAttrDef<any, true> {
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

type LinksIndex = Record<
  "fwd" | "rev",
  Record<string, Record<string, { entityName: string; cardinality: string }>>
>;

export const i = {
  // constructs
  graph,
  entity,
  // value types
  string,
  number,
  boolean,
  json,
  any,
};
