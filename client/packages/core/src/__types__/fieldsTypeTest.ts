import { i, init } from '../index.ts';
import type { Equal, Expect, NotAny } from './typeUtils.ts';

// These tests just check types. See `type _cases = ` for the test cases.

const schema = i.schema({
  entities: {
    tbl: i.entity({
      a: i.number(),
      b: i.string(),
    }),
  },
});

// Test that fields works with a schema
function _testFieldsWithSchema() {
  const schemaDb = init({
    schema: schema,
    appId: '123',
  });
  schemaDb.subscribeQuery({ tbl: { $: { fields: ['a'] } } }, (resp) => {
    const item = resp.data?.tbl[0];
    if (item) {
      type t = typeof item;
      type _cases = [
        Expect<NotAny<t>>,
        Expect<Equal<t, { id: string; a: number }>>,
      ];
    }
  });
  schemaDb.subscribeQuery({ tbl: { $: { fields: ['id', 'a'] } } }, (resp) => {
    const item = resp.data?.tbl[0];
    if (item) {
      type t = typeof item;
      type _cases = [
        Expect<NotAny<t>>,
        Expect<Equal<t, { id: string; a: number }>>,
      ];
    }
  });
  schemaDb.subscribeQuery({ tbl: { $: { fields: undefined } } }, (resp) => {
    const item = resp.data?.tbl[0];
    if (item) {
      type t = typeof item;
      type _cases = [
        Expect<NotAny<t>>,
        Expect<Equal<t, { id: string; a: number; b: string }>>,
      ];
    }
  });
  schemaDb.subscribeQuery({ tbl: {} }, (resp) => {
    const item = resp.data?.tbl[0];
    if (item) {
      type t = typeof item;
      type _cases = [
        Expect<NotAny<t>>,
        Expect<Equal<t, { id: string; a: number; b: string }>>,
      ];
    }
  });
}

// Test that fields does nothing when there is no schema
function _testFieldsNoSchema() {
  const noSchemaDb = init({
    appId: '123',
  });

  noSchemaDb.subscribeQuery({ tbl: { $: { fields: ['a'] } } }, (resp) => {
    const item = resp.data?.tbl[0];
    if (item) {
      type t = typeof item;
      type _cases = [
        Expect<NotAny<t>>,
        Expect<Equal<t, { id: string; [x: string]: any }>>,
      ];
    }
  });

  noSchemaDb.subscribeQuery({ tbl: { $: { fields: ['id', 'a'] } } }, (resp) => {
    const item = resp.data?.tbl[0];
    if (item) {
      type t = typeof item;
      type _cases = [
        Expect<NotAny<t>>,
        Expect<Equal<t, { id: string; [x: string]: any }>>,
      ];
    }
  });

  noSchemaDb.subscribeQuery({ tbl: { $: { fields: undefined } } }, (resp) => {
    const item = resp.data?.tbl[0];
    if (item) {
      type t = typeof item;
      type _cases = [
        Expect<NotAny<t>>,
        Expect<Equal<t, { id: string; [x: string]: any }>>,
      ];
    }
  });
  noSchemaDb.subscribeQuery({ tbl: {} }, (resp) => {
    const item = resp.data?.tbl[0];
    if (item) {
      type t = typeof item;
      type _cases = [
        Expect<NotAny<t>>,
        Expect<Equal<t, { id: string; [x: string]: any }>>,
      ];
    }
  });
}
