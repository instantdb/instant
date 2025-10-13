import type { InstantConfig, InstantSchemaDef } from '@instantdb/core';
import InstantReactAbstractDatabase from './InstantReactAbstractDatabase.tsx';
import { EventSource } from 'eventsource';

export default class InstantReactWebDatabase<
  Schema extends InstantSchemaDef<any, any, any>,
  Config extends InstantConfig<Schema, boolean> = InstantConfig<Schema, false>,
> extends InstantReactAbstractDatabase<Schema, Config> {
  static EventSourceImpl = EventSource;
}
