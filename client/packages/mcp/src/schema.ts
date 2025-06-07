// Helper function to convert Zod schema definition for modifying InstantDB
// schema to a format the InstantDB platform can use

import { i } from '@instantdb/core';

type AttributeConfig = {
  type: 'string' | 'number' | 'boolean' | 'date' | 'json';
  required?: boolean;
  unique?: boolean;
  indexed?: boolean;
};

type LinkConfig = {
  from: {
    entity: string;
    has: 'one' | 'many';
    label: string;
    required?: boolean;
    onDelete?: 'cascade';
  };
  to: {
    entity: string;
    has: 'one' | 'many';
    label: string;
    required?: boolean;
    onDelete?: 'cascade';
  };
};

type Additions = {
  entities?: Record<string, Record<string, AttributeConfig>>;
  links?: Record<string, LinkConfig>;
};

export function zodToSchema(additions: Additions) {
  const schema = {
    entities: {} as Record<string, any>,
    links: {} as Record<string, any>,
  };

  // Handle entities
  if (additions.entities) {
    for (const [entityName, attributes] of Object.entries(additions.entities)) {
      const entityDef: Record<string, any> = {};

      for (const [attrName, attrConfig] of Object.entries(attributes)) {
        // (TODO): Fix me?
        // @ts-ignore
        let attr = i[attrConfig.type]();

        // Apply modifiers
        if (attrConfig.unique) attr = attr.unique();
        if (attrConfig.indexed) attr = attr.indexed();
        if (attrConfig.required === false) attr = attr.optional();

        entityDef[attrName] = attr;
      }

      schema.entities[entityName] = i.entity(entityDef);
    }
  }

  // Handle links
  if (additions.links) {
    for (const [linkName, linkConfig] of Object.entries(additions.links)) {
      schema.links[linkName] = {
        forward: {
          on: linkConfig.from.entity,
          has: linkConfig.from.has,
          label: linkConfig.from.label,
          required: linkConfig.from.required,
          onDelete: linkConfig.from.onDelete,
        },
        reverse: {
          on: linkConfig.to.entity,
          has: linkConfig.to.has,
          label: linkConfig.to.label,
          required: linkConfig.to.required,
          onDelete: linkConfig.to.onDelete,
        },
      };
    }
  }

  return i.schema(schema);
}
