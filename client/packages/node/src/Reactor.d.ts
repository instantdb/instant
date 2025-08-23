import type { RoomSchemaShape } from '@instantdb/core';

declare class Reactor<RoomSchema extends RoomSchemaShape = {}> {
  constructor(config: any, Storage?: any, NetworkListener?: any, versions?: any);
  // Add other methods as needed
  [key: string]: any;
}

export default Reactor;