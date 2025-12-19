import { i } from './schema.ts';
import { DataAttrDef, InstantSchemaDef } from './schemaTypes.ts';

export const parseSchemaFromJSON = (
  s: any,
): InstantSchemaDef<any, any, any> => {
  // Parse entities
  const entities: Record<string, any> = {};

  for (const [entityName, entityInfo] of Object.entries(s.entities)) {
    const entityDef = entityInfo as any;
    const attrs: Record<string, any> = {};

    // Parse attributes
    for (const [attrName, attrInfo] of Object.entries(entityDef.attrs)) {
      const attrDef = attrInfo as any;
      let attr: DataAttrDef<any, any, any>;

      // Create the appropriate attribute type
      switch (attrDef.valueType) {
        case 'string':
          attr = i.string();
          break;
        case 'number':
          attr = i.number();
          break;
        case 'boolean':
          attr = i.boolean();
          break;
        case 'date':
          attr = i.date();
          break;
        case 'json':
          attr = i.json();
          break;
        default:
          attr = i.json();
      }

      // Apply modifiers
      if (!attrDef.required) {
        attr = attr.optional();
      }

      if (attrDef.config?.indexed) {
        attr = attr.indexed();
      }

      if (attrDef.config?.unique) {
        attr = attr.unique();
      }

      attrs[attrName] = attr;
    }

    entities[entityName] = i.entity(attrs);
  }

  // Parse links
  const links: Record<string, any> = s.links || {};

  // Parse rooms
  const rooms: Record<string, any> = {};

  if (s.rooms) {
    for (const [roomName, roomInfo] of Object.entries(s.rooms)) {
      const roomDef = roomInfo as any;

      // Parse presence
      const presenceAttrs: Record<string, any> = {};
      for (const [attrName, attrInfo] of Object.entries(
        roomDef.presence.attrs,
      )) {
        const attrDef = attrInfo as any;
        let attr: DataAttrDef<any, any, any>;

        switch (attrDef.valueType) {
          case 'string':
            attr = i.string();
            break;
          case 'number':
            attr = i.number();
            break;
          case 'boolean':
            attr = i.boolean();
            break;
          case 'date':
            attr = i.date();
            break;
          case 'json':
            attr = i.json();
            break;
          default:
            attr = i.json();
        }

        if (!attrDef.required) {
          attr = attr.optional();
        }

        if (attrDef.config?.indexed) {
          attr = attr.indexed();
        }

        if (attrDef.config?.unique) {
          attr = attr.unique();
        }

        presenceAttrs[attrName] = attr;
      }

      // Parse topics
      const topics: Record<string, any> = {};
      if (roomDef.topics) {
        for (const [topicName, topicInfo] of Object.entries(roomDef.topics)) {
          const topicDef = topicInfo as any;
          const topicAttrs: Record<string, any> = {};

          for (const [attrName, attrInfo] of Object.entries(topicDef.attrs)) {
            const attrDef = attrInfo as any;
            let attr: DataAttrDef<any, any, any>;

            switch (attrDef.valueType) {
              case 'string':
                attr = i.string();
                break;
              case 'number':
                attr = i.number();
                break;
              case 'boolean':
                attr = i.boolean();
                break;
              case 'date':
                attr = i.date();
                break;
              case 'json':
                attr = i.json();
                break;
              default:
                attr = i.json();
            }

            if (!attrDef.required) {
              attr = attr.optional();
            }

            if (attrDef.config?.indexed) {
              attr = attr.indexed();
            }

            if (attrDef.config?.unique) {
              attr = attr.unique();
            }

            topicAttrs[attrName] = attr;
          }

          topics[topicName] = i.entity(topicAttrs);
        }
      }

      rooms[roomName] = {
        presence: i.entity(presenceAttrs),
        topics,
      };
    }
  }

  const resultingSchema = i.schema({
    entities,
    links,
    rooms,
  });

  return resultingSchema;
};
