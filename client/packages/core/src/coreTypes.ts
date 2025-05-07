import { TxChunk } from './instatx.ts';
import { RoomSchemaShape } from './presence.ts';
import type {
  IContainEntitiesAndLinks,
  InstantSchemaDef,
} from './schemaTypes.ts';

export interface IDatabase<
  Schema extends IContainEntitiesAndLinks<any, any> | {} = {},
  _RoomSchema extends RoomSchemaShape = {},
  WithCardinalityInference extends boolean = false,
> {
  tx: TxChunk<
    Schema extends IContainEntitiesAndLinks<any, any>
      ? Schema
      : InstantSchemaDef<any, any, any>
  >;

  withCardinalityInference?: WithCardinalityInference;
}

export interface IInstantDatabase<
  Schema extends InstantSchemaDef<any, any, any>,
> {
  tx: TxChunk<Schema>;
}

export type DevtoolPosition =
  | 'bottom-left'
  | 'bottom-right'
  | 'top-right'
  | 'top-left';

export type DevtoolConfig = {
  /**
   * Position of the devtool panel on the screen
   * @default 'bottom-right'
   */
  position?: DevtoolPosition;

  /**
   * Hosts where the devtool should be shown
   * @default ['localhost']
   */
  allowedHosts?: string[];
};

export type StrictDevtoolConfig = {
  position: DevtoolPosition;
  allowedHosts: string[];
};
