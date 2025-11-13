// -----------
// JSON Schema

import { SchemaNamespace } from '@/lib/types';

type JsonStringSchema = { type: 'string' };

type JsonArraySchema = {
  type: 'array';
  items: JsonSchema;
  minItems?: number;
};

type JsonObjectSchema = {
  type: 'object';
  properties?: Record<string, JsonSchema>;
  patternProperties?: Record<string, JsonSchema>;
  additionalProperties?: boolean;
};

type JsonSchema = JsonStringSchema | JsonArraySchema | JsonObjectSchema;

const makeRuleBlock = ({
  includeFields,
  namespace,
}: {
  includeFields?: boolean;
  namespace?: SchemaNamespace;
}) => {
  const ruleBlock: JsonObjectSchema = {
    type: 'object',
    properties: {
      allow: {
        type: 'object',
        properties: {
          create: { type: 'string' },
          update: { type: 'string' },
          delete: { type: 'string' },
          view: { type: 'string' },
          link: {
            type: 'object',
            properties: {},
            patternProperties: { '^[$a-zA-Z0-9_\\-]+$': { type: 'string' } },
            additionalProperties: false,
          },
          unlink: {
            type: 'object',
            properties: {},
            patternProperties: { '^[$a-zA-Z0-9_\\-]+$': { type: 'string' } },
            additionalProperties: false,
          },
          $default: { type: 'string' },
        },
        additionalProperties: false,
      },
      bind: {
        type: 'array',
        // Use a combination of "items" and "additionalItems" for validation
        items: { type: 'string' },
        minItems: 2,
      },
    },
    additionalProperties: false,
  };

  if (includeFields) {
    const fieldsSchema: JsonObjectSchema = {
      type: 'object',
      patternProperties: {
        '^(?!id$)[$a-zA-Z0-9_\\-]+$': { type: 'string' },
      },
      additionalProperties: false,
    };

    if (namespace) {
      const fieldProps: Record<string, JsonStringSchema> = {};
      for (const attr of namespace.attrs) {
        if (attr.name === 'id' || attr.type !== 'blob') continue;
        fieldProps[attr.name] = { type: 'string' };
      }
      fieldsSchema.properties = fieldProps;
    }

    ruleBlock.properties!.fields = fieldsSchema;
  }

  return ruleBlock;
};

const permsJsonSchema = (
  namespaces: SchemaNamespace[] | null,
): JsonObjectSchema => {
  const properties: Record<string, JsonSchema> = {
    $default: makeRuleBlock({ includeFields: false }),
    attrs: makeRuleBlock({ includeFields: false }),
  };

  if (namespaces) {
    for (const namespace of namespaces) {
      properties[namespace.name] = makeRuleBlock({
        includeFields: true,
        namespace,
      });
    }
  }

  const genericNamespaceRuleBlock = makeRuleBlock({ includeFields: true });
  return {
    type: 'object',
    properties,
    patternProperties: {
      '^[$a-zA-Z0-9_\\-]+$': genericNamespaceRuleBlock,
    },
    additionalProperties: false,
  };
};

export default permsJsonSchema;
