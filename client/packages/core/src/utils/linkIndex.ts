import type { InstantGraph, LinkDef, LinksDef } from '../schemaTypes.ts';

export type LinkIndex = Record<
  string,
  Record<
    string,
    {
      isForward: boolean;
      isSingular: boolean;
      link: LinkDef<any, any, any, any, any, any, any>;
    }
  >
>;

export function createLinkIndex(schema: InstantGraph<any, LinksDef<{}>>) {
  return Object.values(schema.links).reduce((linkIndex, link) => {
    linkIndex[link.forward.on] ??= {};
    linkIndex[link.forward.on][link.forward.label] = {
      isForward: true,
      isSingular: link.forward.has === 'one',
      link,
    };

    linkIndex[link.reverse.on] ??= {};
    linkIndex[link.reverse.on][link.reverse.label] = {
      isForward: false,
      isSingular: link.reverse.has === 'one',
      link,
    };

    return linkIndex;
  }, {} as LinkIndex);
}
