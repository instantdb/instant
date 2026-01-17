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

function _testUseDatesTest() {
  const db = init({
    schema,
    appId: '123',
    useDateObjects: true,
  });

  const { data } = db.useQuery({ tbl: {} });
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

function _testUseDatesFalseTest() {
  const db = init({
    schema,
    appId: '123',
    useDateObjects: false,
  });

  const { data } = db.useQuery({ tbl: {} });
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

function _testUseDatesUndefinedTest() {
  const db = init({
    schema,
    appId: '123',
  });

  const { data } = db.useQuery({ tbl: {} });
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

function _testDataNoSchema() {
  const db = init({
    appId: '123',
  });

  const { data } = db.useQuery({ tbl: {} });
  const item = data?.tbl[0];
  if (item) {
    type t = typeof item.d;
    type _cases = [Expect<IsAny<t>>, Expect<Equal<typeof item.id, string>>];
  }
}
