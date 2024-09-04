import { i, id, init_experimental } from "@instantdb/react";
import config from "../../config";

const db = init_experimental({
  ...config,
  schema: i.graph(
    "",
    {
      habits: i.entity({
        name: i.string(),
      }),
      checkins: i.entity({
        date: i.string(),
      }),
    },
    {
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
    },
  ),
});

export default function Main() {
  const { isLoading, error, data } = db.useQuery({
    checkins: {
      habit: {},
    },
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <ul>
        {data.checkins.map((c) => (
          <li key={c.id}>
            {c.date} - {c.habit?.name}
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
      }),
      db.tx.habits[habitId].link({
        checkins: [checkinId],
      }),
    ]);
  };
}
