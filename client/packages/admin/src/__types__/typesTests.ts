import type { Equal, Expect, IsAny, NotAny } from './typeUtils.ts';
import { i, init } from '../index.ts';

const schema = i.schema({
  entities: {
    tbl: i.entity({
      d: i.date().indexed(),
      dOptional: i.date().optional(),
    }),
  },
});

async function _testUseDatesTest() {
  const db = init({
    schema,
    appId: '123',
    useDateObjects: true,
  });

  const data = await db.query({ tbl: {} });
  const item = data?.tbl[0];
  if (item) {
    type t = typeof item.d;
    type _cases = [Expect<NotAny<t>>, Expect<Equal<t, Date>>];

    type tOpt = typeof item.dOptional;
    type _cases_2 = [
      Expect<NotAny<tOpt>>,
      Expect<Equal<tOpt, Date | undefined>>,
    ];
  }
}

async function _testUseDatesFalseTest() {
  const db = init({
    schema,
    appId: '123',
    useDateObjects: false,
  });

  const data = await db.query({ tbl: {} });
  const item = data?.tbl[0];
  if (item) {
    type t = typeof item.d;
    type _cases = [Expect<NotAny<t>>, Expect<Equal<t, string | number>>];

    type tOpt = typeof item.dOptional;
    type _cases_2 = [
      Expect<NotAny<tOpt>>,
      Expect<Equal<tOpt, string | number | undefined>>,
    ];
  }
}

async function _testUseDatesUndefinedTest() {
  const db = init({
    schema,
    appId: '123',
  });

  const data = await db.query({ tbl: {} });
  const item = data?.tbl[0];
  if (item) {
    type t = typeof item.d;
    type _cases = [Expect<NotAny<t>>, Expect<Equal<t, string | number>>];

    type tOpt = typeof item.dOptional;
    type _cases_2 = [
      Expect<NotAny<tOpt>>,
      Expect<Equal<tOpt, string | number | undefined>>,
    ];
  }
}

async function _testDataNoSchema() {
  const db = init({
    appId: '123',
  });

  const data = await db.query({ tbl: {} });
  const item = data?.tbl[0];
  if (item) {
    type t = typeof item.d;
    type _cases = [Expect<IsAny<t>>, Expect<Equal<typeof item.id, string>>];
  }
}

async function _testSubscribe() {
  // No useDateObjects
  init({
    appId: '123',
    schema,
  }).subscribeQuery({ tbl: {} }, (payload) => {
    if (payload.type === 'ok') {
      const item = payload.data.tbl[0];
      if (item) {
        type _cases = [
          Expect<Equal<typeof item.id, string>>,
          Expect<Equal<typeof item.d, string | number>>,
          Expect<Equal<typeof item.dOptional, string | number | undefined>>,
        ];
      }
    }
  });

  // UseDateObjects
  init({
    appId: '123',
    schema,
    useDateObjects: true,
  }).subscribeQuery({ tbl: {} }, (payload) => {
    if (payload.type === 'ok') {
      const item = payload.data.tbl[0];
      if (item) {
        type _cases = [
          Expect<Equal<typeof item.id, string>>,
          Expect<Equal<typeof item.d, Date>>,
          Expect<Equal<typeof item.dOptional, Date | undefined>>,
        ];
      }
    }
  });

  // No schema
  init({
    appId: '123',
  }).subscribeQuery({ tbl: {} }, (payload) => {
    if (payload.type === 'ok') {
      const item = payload.data.tbl[0];
      if (item) {
        type _cases = [
          Expect<Equal<typeof item.id, string>>,
          Expect<IsAny<typeof item.d>>,
          Expect<IsAny<typeof item.dOptional>>,
        ];
      }
    }
  });
}
