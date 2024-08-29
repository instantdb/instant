import { DataAttrDef, EntitiesDef, InstantGraph, LinkAttrDef } from "./schema";

type Action = "update" | "link" | "unlink" | "delete" | "merge";
type EType = string;
type Id = string;
type Args = any;
type LookupRef = [string, any];
type Lookup = string;
export type Op = [Action, EType, Id | LookupRef, Args];

export interface TransactionChunk<
  S extends InstantGraph<any, any>,
  E extends keyof S["entities"],
> {
  __ops: Op[];
  /**
   * Create and update objects:
   *
   * @example
   *  const goalId = id();
   *  tx.goals[goalId].update({title: "Get fit", difficulty: 5})
   */
  update: (
    args: {
      [K in keyof S["entities"][E]["attrs"]]?: S["entities"][E]["attrs"][K] extends DataAttrDef<
        infer ValueType,
        any
      >
        ? ValueType
        : never;
    } & {
      [attribute: string]: any;
    },
  ) => TransactionChunk<S, E>;
  /**
   * Link two objects together
   *
   * @example
   * const goalId = id();
   * const todoId = id();
   * db.transact([
   *   tx.goals[goalId].update({title: "Get fit"}),
   *   tx.todos[todoId].update({title: "Go on a run"}),
   *   tx.goals[goalId].link({todos: todoId}),
   * ])
   *
   * // Now, if you query:
   * useQuery({ goals: { todos: {} } })
   * // You'll get back:
   *
   * // { goals: [{ title: "Get fit", todos: [{ title: "Go on a run" }]}
   */
  link: (
    args: {
      [K in keyof S["entities"][E]["links"]]?: S["entities"][E]["links"][K] extends LinkAttrDef<
        infer Cardinality,
        any
      >
        ? Cardinality extends "one"
          ? string
          : string | string[]
        : never;
    } & {
      [attribute: string]: string | string[];
    },
  ) => TransactionChunk<S, E>;
  /**
   * Unlink two objects
   * @example
   *  // to "unlink" a todo from a goal:
   *  tx.goals[goalId].unlink({todos: todoId})
   */
  unlink: (
    args: {
      [K in keyof S["entities"][E]["links"]]?: S["entities"][E]["links"][K] extends LinkAttrDef<
        infer Cardinality,
        any
      >
        ? Cardinality extends "one"
          ? string
          : string | string[]
        : never;
    } & {
      [attribute: string]: string | string[];
    },
  ) => TransactionChunk<S, E>;
  /**
   * Delete an object, alongside all of its links.
   *
   * @example
   *   tx.goals[goalId].delete()
   */
  delete: () => TransactionChunk<S, E>;

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
   * tx.goals[goalId].merge({ metrics: { progress: 0.5 }, category: "Fitness" })
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
   *  tx.goals[goalId].merge({title: "Get fitter"})
   */
  merge: (args: { [attribute: string]: any }) => TransactionChunk<S, E>;
}

export interface ETypeChunk<
  S extends InstantGraph<any, any>,
  E extends keyof S["entities"],
> {
  [id: Id]: TransactionChunk<S, E>;
}

export type TxChunk<S extends InstantGraph<any, any>> = {
  [K in keyof S["entities"]]: ETypeChunk<S, K>;
};

function transactionChunk(
  etype: EType,
  id: Id | LookupRef,
  prevOps: Op[],
): TransactionChunk<any, any> {
  return new Proxy({} as TransactionChunk<any, any>, {
    get: (_target, cmd: keyof TransactionChunk<any, any>) => {
      if (cmd === "__ops") return prevOps;
      return (args: Args) => {
        return transactionChunk(etype, id, [
          ...prevOps,
          [cmd, etype, id, args],
        ]);
      };
    },
  });
}

/**
 * Creates a lookup to use in place of an id in a transaction
 *
 * @example
 * tx.users[lookup('email', 'lyndon@example.com')].update({name: 'Lyndon'})
 */
export function lookup(attribute: string, value: string): Lookup {
  return `lookup__${attribute}__${JSON.stringify(value)}`;
}

export function isLookup(k: string): boolean {
  return k.startsWith("lookup__");
}

export function parseLookup(k: string): LookupRef {
  const [_, attribute, ...vJSON] = k.split("__");
  return [attribute, JSON.parse(vJSON.join("__"))];
}

function etypeChunk(etype: EType): ETypeChunk<any, EType> {
  return new Proxy(
    {},
    {
      get(_target, id: Id) {
        if (isLookup(id)) {
          return transactionChunk(etype, parseLookup(id), []);
        }
        return transactionChunk(etype, id, []);
      },
    },
  );
}

export function txInit<
  Schema extends InstantGraph<any, any>,
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
 *   tx.goals[goalId].update({title: "Get fit"})
 *   // Note: you don't need to create `goals` ahead of time.
 */
export const tx = txInit();

export function getOps(x: TransactionChunk<any, any>): Op[] {
  return x.__ops;
}
