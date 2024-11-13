import type { InstantSchemaV2 } from "@instantdb/core";
import { InstantReactExperimental } from "./InstantReactExperimental";

export class InstantReactWebExperimental<
  Schema extends InstantSchemaV2<any, any, any>,
> extends InstantReactExperimental<Schema> {}
