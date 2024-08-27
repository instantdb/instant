type Action = "update" | "link" | "unlink" | "delete" | "merge";
type EType = string;
type Id = string;
type Args = any;
type LookupRef = [string, any];
type Lookup = string;
export type Op = [Action, EType, Id | LookupRef, Args];

export interface TransactionChunk {
  __ops: Op[];
  /**
   * Create and update objects:
   *
   * @example
   *  const goalId = id();
   *  tx.goals[goalId].update({title: "Get fit", difficulty: 5})
   */
  update: (args: { [attribute: string]: any }) => TransactionChunk;
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
  link: (args: { [attribute: string]: string | string[] }) => TransactionChunk;
  /**
   * Unlink two objects
   * @example
   *  // to "unlink" a todo from a goal:
   *  tx.goals[goalId].unlink({todos: todoId})
   */
  unlink: (args: {
    [attribute: string]: string | string[];
  }) => TransactionChunk;
  /**
   * Delete an object, alongside all of its links.
   *
   * @example
   *   tx.goals[goalId].delete()
   */
  delete: () => TransactionChunk;

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
  merge: (args: { [attribute: string]: any }) => TransactionChunk;
}

export interface ETypeChunk {
  [id: Id]: TransactionChunk;
}

export interface EmptyChunk {
  [etype: EType]: ETypeChunk;
}

function transactionChunk(
  etype: EType,
  id: Id | LookupRef,
  prevOps: Op[],
): TransactionChunk {
  return new Proxy({} as TransactionChunk, {
    get: (_target, cmd: keyof TransactionChunk) => {
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

function etypeChunk(etype: EType): ETypeChunk {
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

function emptyChunk(): EmptyChunk {
  return new Proxy(
    {},
    {
      get(_target, ns: EType) {
        return etypeChunk(ns);
      },
    },
  );
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
export const tx = emptyChunk();

export function getOps(x: TransactionChunk): Op[] {
  return x.__ops;
}
