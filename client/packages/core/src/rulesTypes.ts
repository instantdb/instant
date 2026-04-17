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

/**
 * How tokens refill in a rate limit bucket.
 * - `'greedy'`: tokens trickle in continuously over the period.
 * - `'interval'`: all tokens are added at once when the period elapses.
 */
export type InstantRulesRateLimitRefillType = 'interval' | 'greedy';

/**
 * Configuration for how a rate limit bucket refills.
 * All fields are optional and have sensible defaults.
 */
export type InstantRulesRateLimitRefill = {
  /** Number of tokens added per refill. Defaults to the bucket's capacity. */
  amount?: number | null | undefined;
  /**
   * How often tokens refill, as a duration string (e.g. `"1 hour"`, `"30 minutes"`, `"1 day"`).
   * Must be between 1 second and 24 hours. Defaults to `"1 hour"`.
   */
  period?: string | null | undefined;
  /** Refill strategy. Defaults to `"greedy"`. */
  type?: InstantRulesRateLimitRefillType | null | undefined;
};

/**
 * A single rate limit within a bucket. Each limit represents one token bucket
 * constraint. You can combine multiple limits (e.g. a burst limit and a sustained limit).
 */
export type InstantRulesRateLimitLimit = {
  /** Maximum number of tokens in the bucket. */
  capacity: number;
  /** Refill configuration. Defaults to greedy refill of the full capacity every hour. */
  refill?: InstantRulesRateLimitRefill | null | undefined;
};

/**
 * A named rate limit bucket configuration. Use in permission rules via
 * `rateLimit.bucketName.limit(key)`.
 */
export type InstantRulesRateLimit = {
  /** One or more token bucket limits to apply. */
  limits: Array<InstantRulesRateLimitLimit>;
};

/**
 * Map of rate limit names to their configurations.
 * Defined under the `$rateLimits` key in your permission rules.
 */
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
> = {
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
