import { InstantSchemaDef, InstantUnknownSchema } from './schemaTypes.ts';

type InstantRulesAttrsAllowBlock = {
  $default?: string | null | undefined;
  view?: string | null | undefined;
  create?: string | null | undefined;
  update?: string | null | undefined;
  delete?: string | null | undefined;
};

export type InstantRulesAllowBlock = InstantRulesAttrsAllowBlock & {
  link?: { [key: string]: string } | null | undefined;
  unlink?: { [key: string]: string } | null | undefined;
};

export type InstantRulesRateLimitRefillType = 'interval' | 'greedy';

export type InstantRulesRateLimitRefill = {
  amount?: number | null | undefined;
  period?: string | null | undefined;
  type?: InstantRulesRateLimitRefillType | null | undefined;
};

export type InstantRulesRateLimitLimit = {
  capacity: number;
  refill?: InstantRulesRateLimitRefill | null | undefined;
};

export type InstantRulesRateLimit = {
  limits: Array<InstantRulesRateLimitLimit>;
};

export type InstantRulesRateLimits = Record<string, InstantRulesRateLimit>;

type InstantRulesEntityBlock<
  Schema extends InstantSchemaDef<any, any, any>,
  EntityName extends keyof Schema['entities'],
> = {
  bind?: string[] | Record<string, string>;
  allow: InstantRulesAllowBlock;
  fields?: {
    [AttrName in Exclude<
      keyof Schema['entities'][EntityName]['attrs'],
      'id'
    >]?: string;
  };
};

// The rules type is a bit complicated because we need to handle two cases
// 1. If you don't pass a Schema, `keyof Schema['entities']` is just string
//    so we have to leave it out of `K`. `K` would collapse to `string`, so `attrs`,
//    `$default`, and `$rateLimits` would get ignored as separate keys.
// 2. If you do pass a schema, then we can handle each special key separately
//    without it collapsing into string.

export type InstantRules<
  Schema extends InstantSchemaDef<any, any, any> = InstantUnknownSchema,
> = string extends keyof Schema['entities']
  ? {
      [K in 'attrs' | '$default' | '$rateLimits']?: K extends 'attrs'
        ? {
            bind?: string[] | Record<string, string>;
            allow: InstantRulesAttrsAllowBlock;
          }
        : K extends '$default'
          ? {
              bind?: string[] | Record<string, string>;
              allow: InstantRulesAllowBlock;
            }
          : K extends '$rateLimits'
            ? InstantRulesRateLimits
            : never;
    } & {
      [key: string]:
        | {
            bind?: string[] | Record<string, string>;
            allow: InstantRulesAllowBlock;
            fields?: Record<string, string>;
          }
        | undefined;
    }
  : {
      [K in
        | keyof Schema['entities']
        | 'attrs'
        | '$default'
        | '$rateLimits']?: K extends 'attrs'
        ? {
            bind?: string[] | Record<string, string>;
            allow: InstantRulesAttrsAllowBlock;
          }
        : K extends '$default'
          ? {
              bind?: string[] | Record<string, string>;
              allow: InstantRulesAllowBlock;
            }
          : K extends '$rateLimits'
            ? InstantRulesRateLimits
            : K extends keyof Schema['entities']
              ? InstantRulesEntityBlock<Schema, K>
              : never;
    };
