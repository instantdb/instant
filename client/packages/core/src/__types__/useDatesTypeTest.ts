import { i, init } from '../index.ts';
import type { Equal, Expect, NotAny } from './typeUtils.ts';
// These tests just check types. See `type _cases = ` for the test cases.

const schema = i.schema({
  entities: {
    tbl: i.entity({
      d: i.date(),
    }),
  },
});

const dateDb = init({
  schema: schema,
  appId: '123',
  useDateObjects: true,
});

function _testDateDb() {
  dateDb.subscribeQuery({ tbl: {} }, (resp) => {
    const item = resp.data?.tbl[0];
    if (item) {
      const d = item.d;
      type _cases = [Expect<NotAny<typeof d>>, Expect<Equal<typeof d, Date>>];
    }
  });
}

const undefinedDateDb = init({
  schema: schema,
  appId: '123',
});

// Test that undefined returns string | number for date
function _testUndefinedDateDb() {
  undefinedDateDb.subscribeQuery({ tbl: {} }, (resp) => {
    const item = resp.data?.tbl[0];
    if (item) {
      const d = item.d;
      type _cases = [
        Expect<NotAny<typeof d>>,
        Expect<Equal<typeof d, string | number>>,
      ];
    }
  });
}

const noDateDb = init({
  schema: schema,
  appId: '123',
  useDateObjects: false,
});

// Test that false returns string | number for date
function _testNoDateDb() {
  noDateDb.subscribeQuery({ tbl: {} }, (resp) => {
    const item = resp.data?.tbl[0];
    if (item) {
      const d = item.d;
      type _cases = [
        Expect<NotAny<typeof d>>,
        Expect<Equal<typeof d, string | number>>,
      ];
    }
  });
}
