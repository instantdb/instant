import type { InstantConfig, InstantSchemaDef } from '@instantdb/core';
import { InstantReactAbstractDatabase } from '@instantdb/react-common';
import { EventSource } from 'eventsource';

export default class InstantReactWebDatabase<
  Schema extends InstantSchemaDef<any, any, any>,
  Config extends InstantConfig<Schema, boolean> = InstantConfig<
    Schema,
    boolean
  >,
> extends InstantReactAbstractDatabase<Schema, Config> {
  static EventSourceImpl = EventSource;
}
