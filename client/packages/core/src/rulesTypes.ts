import { InstantSchemaDef, InstantUnknownSchema } from './schemaTypes.ts';

type InstantRulesAttrsAllowBlock = {
  $default?: string | null | undefined;
  view?: string | null | undefined;
  create?: string | null | undefined;
  update?: string | null | undefined;
  delete?: string | null | undefined;
};

export type InstantRulesAllowBlock<
  Schema extends InstantSchemaDef<any, any, any> = InstantUnknownSchema,
> = InstantRulesAttrsAllowBlock & {
  link?:
    | { [EntityName in keyof Schema['entities']]?: string }
    | null
    | undefined;
  unlink?:
    | { [EntityName in keyof Schema['entities']]?: string }
    | null
    | undefined;
};

export type InstantRulesAllowBlockWithoutLinks = InstantRulesAttrsAllowBlock;

export type InstantRules<
  Schema extends InstantSchemaDef<any, any, any> = InstantUnknownSchema,
> = {
  $default?: { bind?: string[]; allow: InstantRulesAllowBlock<Schema> };
  attrs?: { bind?: string[]; allow: InstantRulesAllowBlock<Schema> };
} & {
  [EntityName in keyof Schema['entities']]: {
    bind?: string[];
    allow: InstantRulesAllowBlock<Schema>;
  };
};
