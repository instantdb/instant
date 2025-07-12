import { parse, type ParseResult, type File } from '@babel/parser';
import type {
  CallExpression,
  ObjectExpression,
  ObjectProperty,
  Node,
  Expression,
  Identifier,
  StringLiteral,
  NumericLiteral,
  ArrayExpression,
  SpreadElement,
  BooleanLiteral,
} from '@babel/types';

import { GenericSchemaDef } from './util.ts';
import { AttrsDefs, DataAttrDef, i } from '@instantdb/core';

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Converts a Babel AST node into a JavaScript object/value,
 * suitable for JSON serialization.
 * Throws errors for unsupported AST structures.
 * @param {Node | null} node - The Babel AST node to convert.
 * @returns {JsonValue | null} The JavaScript representation.
 * @throws {Error} If the AST node or its structure is not convertible to JSON.
 */
function astToJson(node: Node | null): JsonValue | null {
  if (!node) {
    return null;
  }

  switch (node.type) {
    case 'ObjectExpression':
      const objNode = node as ObjectExpression;
      return objNode.properties.reduce(
        (obj: { [key: string]: JsonValue }, prop) => {
          if (prop.type === 'ObjectProperty') {
            const objectProperty = prop as ObjectProperty;
            let key: string | number;
            if (objectProperty.key.type === 'Identifier') {
              key = (objectProperty.key as Identifier).name;
            } else if (
              objectProperty.key.type === 'StringLiteral' ||
              objectProperty.key.type === 'NumericLiteral'
            ) {
              key = (objectProperty.key as StringLiteral | NumericLiteral)
                .value;
            } else {
              throw new Error(
                `Unsupported key type in ObjectProperty: ${objectProperty.key.type}`,
              );
            }
            obj[key] = astToJson(objectProperty.value);
          } else if (
            prop.type !== 'SpreadElement' &&
            prop.type !== 'ObjectMethod'
          ) {
            throw new Error(
              // @ts-expect-error: prop is `never` here
              `Unsupported property type in ObjectExpression: ${prop.type}`,
            );
          }
          return obj;
        },
        {},
      );

    case 'ArrayExpression':
      const arrNode = node as ArrayExpression;
      return arrNode.elements
        .map((element) => {
          if (element && element.type === 'SpreadElement') {
            return undefined;
          }
          return astToJson(element as Expression | SpreadElement | null);
        })
        .filter((value) => value !== undefined) as JsonValue[];

    case 'ObjectProperty':
      const objPropNode = node as ObjectProperty;
      let objectPropertyKey: string | number;
      if (objPropNode.key.type === 'Identifier') {
        objectPropertyKey = (objPropNode.key as Identifier).name;
      } else if (
        objPropNode.key.type === 'StringLiteral' ||
        objPropNode.key.type === 'NumericLiteral'
      ) {
        objectPropertyKey = (objPropNode.key as StringLiteral | NumericLiteral)
          .value;
      } else {
        throw new Error(
          `Unsupported key type for standalone ObjectProperty: ${objPropNode.key.type}`,
        );
      }
      const newObj: { [key: string]: JsonValue } = {};
      newObj[objectPropertyKey] = astToJson(objPropNode.value);
      return newObj;

    case 'StringLiteral':
    case 'NumericLiteral':
    case 'BooleanLiteral':
      return (node as StringLiteral | NumericLiteral | BooleanLiteral).value;

    case 'NullLiteral':
      return null;

    default:
      throw new Error(
        `Unsupported AST node type for JSON conversion: ${node.type}`,
      );
  }
}

function keyName(property: ObjectProperty): string {
  switch (property.key.type) {
    case 'Identifier':
      return property.key.name;
    case 'StringLiteral':
      return property.key.value;
    default:
      throw new Error(
        `Could not extract entities, expected object key to be an \`Identifier\` or \`StringLiteral\`, got \`${property.key.type}\`.`,
      );
  }
}

function entityNodeToEntityDef(
  etype: string,
  node: ObjectExpression,
): GenericSchemaDef['entities'][string] {
  const attrs: AttrsDefs = {};
  for (const property of node.properties) {
    if (property.type !== 'ObjectProperty') {
      throw new Error(
        `Expected i.entity for \`${etype}\` to contain only \`ObjectProperty\`, got \`${property.type}\`.`,
      );
    }
    const label = keyName(property);

    const props = [];

    if (property.value.type !== 'CallExpression') {
      throw new Error(
        `Could not extract \`${etype}.${label}\`. Expected a call to \`i.string()\`, \`i.number()\`, etc. Got something else.`,
      );
    }
    let next: CallExpression | null = property.value;
    if (label === 'path') {
    }
    let attrDef: DataAttrDef<string, boolean, boolean> | null = null;
    while (next) {
      if (
        next.callee.type !== 'MemberExpression' ||
        next.callee.property.type !== 'Identifier' ||
        !(
          next.callee.object.type === 'CallExpression' ||
          (next.callee.object.type === 'Identifier' &&
            next.callee.object.name === 'i')
        )
      ) {
        throw new Error(
          `Could not extract \`${etype}.${label}\`. Expected a call to \`i.string()\`, \`i.number()\`, etc. Got something else.`,
        );
      }

      if (next.callee.object.type === 'CallExpression') {
        props.push(next.callee.property.name);
        next = next.callee.object;
      } else {
        switch (next.callee.property.name) {
          case 'string': {
            attrDef = i.string();
            break;
          }
          case 'number': {
            attrDef = i.number();
            break;
          }
          case 'boolean': {
            attrDef = i.boolean();
            break;
          }
          case 'date': {
            attrDef = i.date();
            break;
          }
          case 'json': {
            attrDef = i.json();
            break;
          }
          case 'any': {
            attrDef = i.any();
            break;
          }
        }
        next = null;
      }
    }

    if (!attrDef) {
      throw new Error(
        `Could not extract \`${etype}.${label}\`. Found no call to \`i.string()\`, \`i.number()\`, etc.`,
      );
    }

    for (const prop of props.reverse()) {
      switch (prop) {
        case 'indexed': {
          attrDef = attrDef.indexed();
          break;
        }
        case 'unique': {
          attrDef = attrDef.unique();
          break;
        }
        case 'optional': {
          attrDef = attrDef.optional();
          break;
        }
        case 'clientRequired': {
          attrDef = attrDef.clientRequired();
          break;
        }
        default: {
          throw new Error(
            `Could not extract \`${etype}.${label}\`. Found a call to \`${prop}()\` that is not recognized.`,
          );
        }
      }
    }

    attrs[label] = attrDef;
  }

  return i.entity(attrs);
}

function entitiesNodeToEntitiesDef(
  node: ObjectExpression,
): GenericSchemaDef['entities'] {
  const entities: GenericSchemaDef['entities'] = {};
  for (const property of node.properties) {
    if (property.type !== 'ObjectProperty') {
      throw new Error(
        `Expected entities to contain only \`ObjectProperty\`, got \`${property.type}\`.`,
      );
    }
    const etype = keyName(property);
    if (
      property.value.type !== 'CallExpression' ||
      property.value.callee.type !== 'MemberExpression' ||
      property.value.callee.object.type !== 'Identifier' ||
      property.value.callee.object.name !== 'i' ||
      property.value.arguments.length !== 1 ||
      property.value.arguments[0].type !== 'ObjectExpression'
    ) {
      throw new Error(
        `Could not extract entity \`${etype}\`. Expected a call to \`i.entity()\`, got something else.`,
      );
    }
    entities[etype] = entityNodeToEntityDef(etype, property.value.arguments[0]);
  }

  return entities;
}

function roomNodeToRoomDef(
  roomName: string,
  node: ObjectExpression,
): GenericSchemaDef['rooms'][string] {
  let presence: GenericSchemaDef['rooms'][string]['presence'] | null = null;
  let topics: GenericSchemaDef['rooms'][string]['topics'] | undefined =
    undefined;
  for (const property of node.properties) {
    if (property.type !== 'ObjectProperty') {
      throw new Error(
        `Expected entities to contain only \`ObjectProperty\`, got \`${property.type}\`.`,
      );
    }
    const propName = keyName(property);
    switch (propName) {
      case 'topics': {
        if (property.value.type !== 'ObjectExpression') {
          throw new Error(
            `Could not exxtract \`rooms.${roomName}.topics\`. Expected an object, got \`${property.value.type}\`.`,
          );
        }
        topics = entitiesNodeToEntitiesDef(property.value);
        break;
      }
      case 'presence': {
        if (
          property.value.type !== 'CallExpression' ||
          property.value.callee.type !== 'MemberExpression' ||
          property.value.callee.object.type !== 'Identifier' ||
          property.value.callee.object.name !== 'i' ||
          property.value.arguments.length !== 1 ||
          property.value.arguments[0].type !== 'ObjectExpression'
        ) {
          throw new Error(
            `Could not extract \`rooms.${roomName}.presence\`. Expected a call to \`i.entity()\`, got something else.`,
          );
        }
        presence = entityNodeToEntityDef(roomName, property.value.arguments[0]);
        break;
      }
      default: {
        throw new Error(
          `Could not extract \`rooms.${roomName}\`. Unexpected property \`${propName}\`.`,
        );
      }
    }
  }
  if (!presence) {
    throw new Error(
      `Could not extract room ${roomName}, \`presence\` key was missing from room definition.`,
    );
  }
  return { presence, topics };
}

function roomsNodeToRoomsDef(
  node: ObjectExpression,
): GenericSchemaDef['rooms'] {
  const rooms: GenericSchemaDef['rooms'] = {};
  for (const property of node.properties) {
    if (property.type !== 'ObjectProperty') {
      throw new Error(
        `Expected entities to contain only \`ObjectProperty\`, got \`${property.type}\`.`,
      );
    }

    const roomName = keyName(property);

    if (property.value.type !== 'ObjectExpression') {
      throw new Error(
        `Could not extract room \`${roomName}\`. Expected an object with topics and presence keys, got \`${property.value.type}\`.`,
      );
    }

    rooms[roomName] = roomNodeToRoomDef(roomName, property.value);
  }

  return rooms;
}

function astToSchemaDef(ast: ParseResult<File>): GenericSchemaDef {
  let entities: GenericSchemaDef['entities'] | null = null;
  let links = {};
  let rooms = {};

  for (const n of ast.program.body) {
    if (
      n.type !== 'VariableDeclaration' ||
      n.declarations.length !== 1 ||
      n.declarations[0].id.type !== 'Identifier' ||
      n.declarations[0].id.name !== '_schema'
    ) {
      continue;
    }

    const node = n.declarations[0];

    if (
      !node.init ||
      node.init.type !== 'CallExpression' ||
      node.init.callee.type !== 'MemberExpression' ||
      node.init.callee.object.type !== 'Identifier' ||
      node.init.callee.object.name !== 'i' ||
      node.init.arguments.length !== 1 ||
      node.init.arguments[0].type !== 'ObjectExpression'
    ) {
      throw new Error(
        `Could not extract schema. Expected a call to \`i.schema()\`, got something else.`,
      );
    }

    for (const property of node.init.arguments[0].properties) {
      if (property.type !== 'ObjectProperty') {
        throw new Error(
          `Could not extra schema property, expected an \`ObjectProperty\`, got \`${property.type}\'.`,
        );
      }
      const section = keyName(property);
      if (property.value.type !== 'ObjectExpression') {
        throw new Error(
          `Failed to extract ${section}, expected an \`ObjectExpression\`, got \`${property.value.type}\`.`,
        );
      }
      switch (keyName(property)) {
        case 'entities': {
          entities = entitiesNodeToEntitiesDef(property.value);
          break;
        }
        case 'links': {
          links = astToJson(property.value) || {};
          break;
        }
        case 'rooms': {
          rooms = roomsNodeToRoomsDef(property.value);
          break;
        }
      }
    }
  }

  if (!entities) {
    throw new Error('Could not extract schema, did not find any entities.');
  }

  return i.schema({ entities, links, rooms });
}

export function schemaTypescriptFileToInstantSchema(
  content: string,
  sourceFilename: string = 'instant.schema.ts',
): GenericSchemaDef {
  const ast = parse(content, {
    sourceFilename,
    sourceType: 'module',
    errorRecovery: false,
    plugins: ['typescript'],
  });
  if (ast.errors?.length) {
    throw new Error(
      `Could not parse schema file. ${ast.errors[0].reasonCode}.`,
    );
  }

  return astToSchemaDef(ast);
}
