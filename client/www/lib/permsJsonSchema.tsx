// -----------
// JSON Schema

import { SchemaNamespace } from '@/lib/types';

type JsonStringSchema = { type: 'string'; enum?: string[] };

type JsonNumberSchema = { type: 'number' };

type JsonIntegerSchema = { type: 'integer' };

type JsonArraySchema = {
  type: 'array';
  items: JsonSchema;
  minItems?: number;
};

type JsonObjectSchema = {
  type: 'object';
  properties?: Record<string, JsonSchema>;
  required?: string[];
  patternProperties?: Record<string, JsonSchema>;
  additionalProperties?: boolean | JsonSchema;
};

type JsonOneOfSchema = {
  oneOf: JsonSchema[];
};

type JsonSchema =
  | JsonStringSchema
  | JsonNumberSchema
  | JsonIntegerSchema
  | JsonArraySchema
  | JsonObjectSchema
  | JsonOneOfSchema;

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
          $default: { type: 'string' },
        },
        additionalProperties: false,
      },
      bind: {
        oneOf: [
          {
            type: 'array',
            items: { type: 'string' },
            minItems: 2,
          },
          {
            type: 'object',
            additionalProperties: { type: 'string' },
          },
        ],
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
  const rateLimitRefillSchema: JsonObjectSchema = {
    type: 'object',
    properties: {
      amount: { type: 'integer' },
      period: { type: 'string' },
      type: { type: 'string', enum: ['interval', 'greedy'] },
    },
    additionalProperties: false,
  };

  const rateLimitLimitSchema: JsonObjectSchema = {
    type: 'object',
    properties: {
      capacity: { type: 'integer' },
      refill: rateLimitRefillSchema,
    },
    required: ['capacity'],
    additionalProperties: false,
  };

  const rateLimitSchema: JsonObjectSchema = {
    type: 'object',
    properties: {
      limits: {
        type: 'array',
        items: rateLimitLimitSchema,
        minItems: 1,
      },
    },
    required: ['limits'],
    additionalProperties: false,
  };

  const rateLimitsSchema: JsonObjectSchema = {
    type: 'object',
    additionalProperties: rateLimitSchema,
  };

  const properties: Record<string, JsonSchema> = {
    $default: makeRuleBlock({ includeFields: false }),
    attrs: makeRuleBlock({ includeFields: false }),
    $rateLimits: rateLimitsSchema,
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
