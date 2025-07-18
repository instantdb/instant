import type { InstantConfig, InstantSchemaDef } from '@instantdb/core';
import InstantReactAbstractDatabase from './InstantReactAbstractDatabase.ts';

export default class InstantReactWebDatabase<
  Config extends InstantConfig<InstantSchemaDef<any, any, any>, boolean>,
> extends InstantReactAbstractDatabase<Config> {}
