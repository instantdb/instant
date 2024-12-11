import {
  i,
  id,
  init,
  InstaQLParams,
  InstaQLResult,
  InstaQLEntity,
} from "@instantdb/react";

import config from "../../config";

interface Data {
  notes: string;
}

const schema = i
  .schema({
    entities: {
      discriminatedUnionExample: i
        .entity({ x: i.string(), y: i.number(), z: i.number() })
        .asType<{ x: "foo"; y: 1 } | { x: "bar" }>(),
      habits: i.entity({
        name: i.string(),
        enum: i.string<"a" | "b">(),
      }),
      checkins: i.entity({
        date: i.string(),
        data: i.json<Data>().optional(),
        meta: i.string().optional(),
      }),
      categories: i.entity({
        name: i.string(),
      }),
    },
    links: {
      habitCheckins: {
        forward: {
          on: "habits",
          has: "many",
          label: "checkins",
        },
        reverse: {
          on: "checkins",
          has: "one",
          label: "habit",
        },
      },
      habitCategory: {
        forward: {
          on: "habits",
          has: "one",
          label: "category",
        },
        reverse: {
          on: "categories",
          has: "many",
          label: "habits",
        },
      },
    },
    rooms: {
      demo: {
        presence: i.entity({
          test: i.number(),
        }),
      },  
    }
  });

const db = init({
  ...config,
  schema,
});

type DB = typeof db;

export default function Main() {
  db.room("demo", "demo").useSyncPresence({
    test: Date.now(),
  });

  const { isLoading, error, data } = db.useQuery({
    discriminatedUnionExample: {},
    checkins: {
      habit: {
        category: {},
      },
    },
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  const du = data.discriminatedUnionExample.at(0);

  if (du?.x === "foo") {
    // y should be constrained to 1
    du.y;
  }

  return (
    <div>
      <ul>
        {data.checkins.map((c) => (
          <li key={c.id}>
            {c.date} - {c.habit?.name} ({c.habit?.category?.name})
          </li>
        ))}
      </ul>
    </div>
  );
}

if (typeof window !== "undefined") {
  (window as any)._create = () => {
    const habitId = id();
    const checkinId = id();
    db.transact([
      db.tx.habits[habitId].update({
        name: "Habit " + Math.random().toString().slice(2),
      }),
      db.tx.checkins[checkinId].update({
        date: Date.now().toString(),
        data: { notes: "" },
        meta: null,
      }),
      db.tx.habits[habitId].link({
        checkins: [checkinId],
      }),
    ]);
  };
}

// demo utility types

const checkinsQuery = {
  checkins: {
    $: {
      where: {
        // ...
      },
    },
    habit: {
      category: {},
    },
  },
} satisfies InstaQLParams<typeof schema>;

type CheckinsQueryResult = InstaQLResult<typeof schema, typeof checkinsQuery>;

const result: CheckinsQueryResult = {
  checkins: [
    {
      id: "",
      date: "",
      data: {
        notes: "",
      },
      meta: "",
      habit: {
        id: "",
        name: "",
        enum: "a",
        category: {
          id: "",
          name: "",
        },
      },
    },
  ],
};

const deepVal = result.checkins[0].habit?.category?.id;

// types
type DeepVal = typeof deepVal;
type Checkin = InstaQLEntity<
  typeof schema,
  "checkins",
  {
    habit: {
      category: {};
    };
  }
>;
