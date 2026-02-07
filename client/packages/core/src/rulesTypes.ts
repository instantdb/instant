import { InstantSchemaDef, InstantUnknownSchema } from './schemaTypes.ts';

type InstantRulesAttrsAllowBlock = {
  $default?: string | null | undefined;
  view?: string | null | undefined;
  create?: string | null | undefined;
  update?: string | null | undefined;
  delete?: string | null | undefined;
};

type InstantRoomRulesAllowBlock = {
  $default?: string | null | undefined;
  join?: string | null | undefined;
};

export type InstantRulesAllowBlock = InstantRulesAttrsAllowBlock & {
  link?: { [key: string]: string } | null | undefined;
  unlink?: { [key: string]: string } | null | undefined;
};

export type InstantRules<
  Schema extends InstantSchemaDef<any, any, any> = InstantUnknownSchema,
> = {
  $default?: {
    bind?: string[] | Record<string, string>;
    allow: InstantRulesAllowBlock;
  };
  attrs?: {
    bind?: string[] | Record<string, string>;
    allow: InstantRulesAttrsAllowBlock;
  };
  $rooms?: {
    [RoomType: string]: {
      bind?: string[] | Record<string, string>;
      allow: InstantRoomRulesAllowBlock;
    };
  };
} & {
  [EntityName in keyof Schema['entities']]?: {
    bind?: string[] | Record<string, string>;
    allow: InstantRulesAllowBlock;
    fields?: {
      [AttrName in Exclude<
        keyof Schema['entities'][EntityName]['attrs'],
        'id'
      >]?: string;
    };
  };
};
