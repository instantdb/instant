import { i } from '@instantdb/core';
import { Webhooks } from '../index.ts';
import type { Equal, Expect, IsAny, NotAny, NotNever } from './typeUtils.ts';

// ---------- With a schema ----------

const schema = i.schema({
  entities: {
    users: i.entity({
      email: i.string().indexed(),
      age: i.number().optional(),
    }),
  },
});

type Schema = typeof schema;

function _typedRecordWithSchemaCreate() {
  const { typedHandlers } = Webhooks.helpers<Schema>();
  typedHandlers('users', 'create', (record) => {
    type Etype = typeof record.etype;
    type Action = typeof record.action;
    type Before = typeof record.before;
    type After = typeof record.after;

    type _cases = [
      Expect<NotAny<typeof record>>,
      Expect<Equal<Etype, 'users'>>,
      Expect<Equal<Action, 'create'>>,
      Expect<Equal<Before, null>>,
      Expect<NotAny<After>>,
      // The entity has id + the schema attrs.
      Expect<Equal<After['id'], string>>,
      Expect<Equal<After['email'], string>>,
      Expect<Equal<After['age'], number | undefined>>,
    ];
  });
}

function _typedRecordWithSchemaUpdate() {
  const { typedHandlers } = Webhooks.helpers<Schema>();
  typedHandlers('users', 'update', (record) => {
    type Before = typeof record.before;
    type After = typeof record.after;
    type _cases = [
      Expect<Equal<typeof record.etype, 'users'>>,
      Expect<Equal<typeof record.action, 'update'>>,
      // Both before and after are present for updates.
      Expect<Equal<Before['id'], string>>,
      Expect<Equal<After['id'], string>>,
      Expect<Equal<Before['email'], string>>,
      Expect<Equal<After['email'], string>>,
    ];
  });
}

function _typedRecordWithSchemaDelete() {
  const { typedHandlers } = Webhooks.helpers<Schema>();
  typedHandlers('users', 'delete', (record) => {
    type _cases = [
      Expect<Equal<typeof record.etype, 'users'>>,
      Expect<Equal<typeof record.action, 'delete'>>,
      // `after` is null for deletes; `before` carries the entity.
      Expect<Equal<typeof record.after, null>>,
      Expect<Equal<typeof record.before.id, string>>,
      Expect<Equal<typeof record.before.email, string>>,
    ];
  });
}

function _defaultHandlerWithSchema() {
  const { typedHandlers } = Webhooks.helpers<Schema>();
  typedHandlers('$default', (record) => {
    type Etype = typeof record.etype;
    type Action = typeof record.action;
    type _cases = [
      // The $default form spans all etypes and actions in the schema.
      Expect<Equal<Etype, 'users'>>,
      Expect<Equal<Action, 'create' | 'update' | 'delete'>>,
    ];
  });
}

// ---------- Without a schema ----------

function _typedRecordNoSchemaCreate() {
  // Helpers default to InstantUnknownSchema when no schema is given.
  const { typedHandlers } = Webhooks.helpers();
  typedHandlers('$users', 'create', (record) => {
    type Etype = typeof record.etype;
    type Action = typeof record.action;
    type After = typeof record.after;
    type _cases = [
      Expect<NotAny<typeof record>>,
      Expect<NotNever<typeof record>>,
      // The literal etype passed at the call site is preserved even without
      // a schema — this is the regression we just fixed.
      Expect<Equal<Etype, '$users'>>,
      Expect<Equal<Action, 'create'>>,
      Expect<Equal<typeof record.before, null>>,
      // `after` is an entity reachable without a schema (the regression we
      // fixed). With unknown attrs, individual fields fall through to `any`
      // via the index signature, so we just check the shape is usable.
      Expect<NotNever<After>>,
      Expect<NotNever<After['id']>>,
    ];
    // Arbitrary field access is allowed under unknown schema (would error
    // if `after` resolved to `never`).
    const _email: unknown = record.after.email;
  });
}

function _typedRecordNoSchemaUpdate() {
  const { typedHandlers } = Webhooks.helpers();
  typedHandlers('posts', 'update', (record) => {
    type _cases = [
      Expect<Equal<typeof record.etype, 'posts'>>,
      Expect<Equal<typeof record.action, 'update'>>,
      Expect<NotNever<typeof record.before>>,
      Expect<NotNever<typeof record.after>>,
    ];
  });
}

function _typedRecordNoSchemaDelete() {
  const { typedHandlers } = Webhooks.helpers();
  typedHandlers('comments', 'delete', (record) => {
    type _cases = [
      Expect<Equal<typeof record.etype, 'comments'>>,
      Expect<Equal<typeof record.action, 'delete'>>,
      Expect<Equal<typeof record.after, null>>,
      Expect<NotNever<typeof record.before>>,
    ];
  });
}

function _defaultHandlerNoSchema() {
  const { typedHandlers } = Webhooks.helpers();
  typedHandlers('$default', (record) => {
    type Etype = typeof record.etype;
    type Action = typeof record.action;
    type _cases = [
      // Without a schema, etype is exactly `string` — not `string | number`
      // (which would leak the TS index-signature `keyof` artifact, since
      // etypes are always strings on the wire).
      Expect<Equal<Etype, string>>,
      Expect<Equal<Action, 'create' | 'update' | 'delete'>>,
    ];
  });
}

// ---------- combineHandlers preserves narrowing ----------

function _combineHandlersAcceptsTypedEntries() {
  const { typedHandlers, combineHandlers } = Webhooks.helpers<Schema>();
  const handlers = combineHandlers(
    typedHandlers('users', 'create', (_record) => {}),
    typedHandlers('users', 'update', (_record) => {}),
    typedHandlers('$default', (_record) => {}),
  );
  type _cases = [Expect<NotAny<typeof handlers>>];
}

function _combineHandlersAcceptsTypedEntriesNoSchema() {
  // Same call shape should work against an unknown schema.
  const { typedHandlers, combineHandlers } = Webhooks.helpers();
  const handlers = combineHandlers(
    typedHandlers('$users', 'create', (_record) => {}),
    typedHandlers('$default', (_record) => {}),
  );
  type _cases = [Expect<NotAny<typeof handlers>>];
}

// ---------- Unknown etype is rejected when a schema is supplied ----------

function _typedHandlersRejectsUnknownEtypeWithSchema() {
  const { typedHandlers } = Webhooks.helpers<Schema>();
  // The schema only declares `users`. Passing an etype not in the schema
  // should fail typecheck.
  // @ts-expect-error - 'posts' is not in Schema['entities']
  typedHandlers('posts', 'create', (_record) => {});

  // Sanity: the known etype still typechecks.
  typedHandlers('users', 'create', (_record) => {});
}

// Silence unused-symbol warnings for the test cases.
type _silence = IsAny<unknown>;
