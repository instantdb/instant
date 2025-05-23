import { InstantSchemaDef, InstantUnknownSchema } from './schemaTypes.ts';

export type InstantRulesAllowBlock = {
  $default?: string | null | undefined;
  view?: string | null | undefined;
  create?: string | null | undefined;
  update?: string | null | undefined;
  delete?: string | null | undefined;
};

export type InstantRules<
  Schema extends InstantSchemaDef<any, any, any> = InstantUnknownSchema,
> = {
  $default?: { bind?: string[]; allow: InstantRulesAllowBlock };
  attrs?: { bind?: string[]; allow: InstantRulesAllowBlock };
} & {
  [EntityName in keyof Schema['entities']]: {
    bind?: string[];
    allow: InstantRulesAllowBlock;
  };
};
