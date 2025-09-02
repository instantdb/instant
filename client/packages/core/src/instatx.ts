import type {
  IContainEntitiesAndLinks,
  LinkParams,
  CreateParams,
  UpdateParams,
  UpdateOpts,
  RuleParams,
} from './schemaTypes.ts';

type Action =
  | 'create'
  | 'update'
  | 'link'
  | 'unlink'
  | 'delete'
  | 'merge'
  | 'ruleParams';
type EType = string;
type Id = string;
type Args = any;
type LookupRef = [string, any];
type Lookup = string;
type Opts = UpdateOpts;
export type Op = [Action, EType, Id | LookupRef, Args, Opts?];

export interface TransactionChunk<
  Schema extends IContainEntitiesAndLinks<any, any>,
  EntityName extends keyof Schema['entities'],
> {
  __ops: Op[];
  __etype: EntityName;
  /**
   * Create objects. Throws an error if the object with the provided ID already
   * exists.
   */
  create: (
    args: CreateParams<Schema, EntityName>,
  ) => TransactionChunk<Schema, EntityName>;

  /**
   * Create and update objects. By default works in upsert mode (will create
   * entity if that doesn't exist). Can be optionally put into "strict update"
   * mode by providing { upsert: false } option as second argument:
   *
   * @example
   *  const goalId = id();
   *  // upsert
   *  db.tx.goals[goalId].update({title: "Get fit", difficulty: 5})
   *
   *  // strict update
   *  db.tx.goals[goalId].update({title: "Get fit"}, {upsert: false})
   */
  update: (
    args: UpdateParams<Schema, EntityName>,
    opts?: UpdateOpts,
  ) => TransactionChunk<Schema, EntityName>;

  /**
   * Link two objects together
   *
   * @example
   * const goalId = id();
   * const todoId = id();
   * db.transact([
   *   db.tx.goals[goalId].update({title: "Get fit"}),
   *   db.tx.todos[todoId].update({title: "Go on a run"}),
   *   db.tx.goals[goalId].link({todos: todoId}),
   * ])
   *
   * // Now, if you query:
   * useQuery({ goals: { todos: {} } })
   * // You'll get back:
   *
   * // { goals: [{ title: "Get fit", todos: [{ title: "Go on a run" }]}
   */
  link: (
    args: LinkParams<Schema, EntityName>,
  ) => TransactionChunk<Schema, EntityName>;
  /**
   * Unlink two objects
   * @example
   *  // to "unlink" a todo from a goal:
   *  db.tx.goals[goalId].unlink({todos: todoId})
   */
  unlink: (
    args: LinkParams<Schema, EntityName>,
  ) => TransactionChunk<Schema, EntityName>;
  /**
   * Delete an object, alongside all of its links.
   *
   * @example
   *   db.tx.goals[goalId].delete()
   */
  delete: () => TransactionChunk<Schema, EntityName>;

  /**
   *
   * Similar to `update`, but instead of overwriting the current value, it will merge the provided values into the current value.
   *
   * This is useful for deeply nested, document-style values, or for updating a single attribute at an arbitrary depth without overwriting the rest of the object.
   *
   * For example, if you have a goal with a nested `metrics` object:
   *
   * ```js
   * goal = { name: "Get fit", metrics: { progress: 0.3 } }
   * ```
   *
   * You can update the `progress` attribute like so:
   *
   * ```js
   * db.tx.goals[goalId].merge({ metrics: { progress: 0.5 }, category: "Fitness" })
   * ```
   *
   * And the resulting object will be:
   *
   * ```js
   * goal = { name: "Get fit", metrics: { progress: 0.5 }, category: "Fitness"  }
   *  ```
   *
   * @example
   *  const goalId = id();
   *  db.tx.goals[goalId].merge({title: "Get fitter"})
   */
  merge: (
    args: {
      [attribute: string]: any;
    },
    opts?: UpdateOpts,
  ) => TransactionChunk<Schema, EntityName>;

  ruleParams: (args: RuleParams) => TransactionChunk<Schema, EntityName>;
}

// This is a hack to get typescript to enforce that
// `allTransactionChunkKeys` contains all the keys of `TransactionChunk`
type TransactionChunkKey = keyof TransactionChunk<any, any>;
function getAllTransactionChunkKeys(): Set<TransactionChunkKey> {
  const v: any = 1;
  const _dummy: TransactionChunk<any, any> = {
    __etype: v,
    __ops: v,
    create: v,
    update: v,
    link: v,
    unlink: v,
    delete: v,
    merge: v,
    ruleParams: v,
  };
  return new Set(Object.keys(_dummy)) as Set<TransactionChunkKey>;
}
const allTransactionChunkKeys = getAllTransactionChunkKeys();

export interface ETypeChunk<
  Schema extends IContainEntitiesAndLinks<any, any>,
  EntityName extends keyof Schema['entities'],
> {
  [id: Id]: TransactionChunk<Schema, EntityName>;
}

export type TxChunk<Schema extends IContainEntitiesAndLinks<any, any>> = {
  [EntityName in keyof Schema['entities']]: ETypeChunk<Schema, EntityName>;
};

function transactionChunk(
  etype: EType,
  id: Id | LookupRef,
  prevOps: Op[],
): TransactionChunk<any, any> {
  const target = {
    __etype: etype,
    __ops: prevOps,
  };
  return new Proxy(target as unknown as TransactionChunk<any, any>, {
    get: (_target, cmd: keyof TransactionChunk<any, any>) => {
      if (cmd === '__ops') return prevOps;
      if (cmd === '__etype') return etype;
      if (!allTransactionChunkKeys.has(cmd)) {
        return undefined;
      }
      return (args: Args, opts?: Opts) => {
        return transactionChunk(etype, id, [
          ...prevOps,
          opts ? [cmd, etype, id, args, opts] : [cmd, etype, id, args],
        ]);
      };
    },
  });
}

/**
 * Creates a lookup to use in place of an id in a transaction
 *
 * @example
 * db.tx.users[lookup('email', 'lyndon@example.com')].update({name: 'Lyndon'})
 */
export function lookup(attribute: string, value: any): Lookup {
  return `lookup__${attribute}__${JSON.stringify(value)}`;
}

export function isLookup(k: string): boolean {
  return k.startsWith('lookup__');
}

export function parseLookup(k: string): LookupRef {
  const [_, attribute, ...vJSON] = k.split('__');
  return [attribute, JSON.parse(vJSON.join('__'))];
}

function etypeChunk(etype: EType): ETypeChunk<any, EType> {
  return new Proxy(
    {
      __etype: etype,
    } as unknown as ETypeChunk<any, EType>,
    {
      get(_target, cmd: Id) {
        if (cmd === '__etype') return etype;
        const id = cmd;
        if (isLookup(id)) {
          return transactionChunk(etype, parseLookup(id), []);
        }
        return transactionChunk(etype, id, []);
      },
    },
  );
}

export function txInit<
  Schema extends IContainEntitiesAndLinks<any, any>,
>(): TxChunk<Schema> {
  return new Proxy(
    {},
    {
      get(_target, ns: EType) {
        return etypeChunk(ns);
      },
    },
  ) as any;
}

/**
 * A handy builder for changes.
 *
 * You must start with the `namespace` you want to change:
 *
 * @example
 *   db.tx.goals[goalId].update({title: "Get fit"})
 *   // Note: you don't need to create `goals` ahead of time.
 */
export const tx = txInit();

export function getOps(x: TransactionChunk<any, any>): Op[] {
  return x.__ops;
}
