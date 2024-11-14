import type { DoNotUseInstantSchema } from "@instantdb/core";
import { DoNotUseInstantReact } from "./DoNotUseInstantReact";

export class DoNotUseInstantReactWeb<
  Schema extends DoNotUseInstantSchema<any, any, any>,
> extends DoNotUseInstantReact<Schema> {}
