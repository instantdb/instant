import { init } from "@instantdb/react";
import { useEffect, useMemo, useState } from "react";
import config from "../../config";

const db = init(config);

export default function () {
  const [selectedPersonId, setSelectedPersonId] = useState<null | string>(null);

  const peopleRes = db.useQuery({
    people: {},
  });

  const person = useMemo(
    () =>
      peopleRes.data?.people.find((person) => person.id === selectedPersonId),
    [peopleRes.data, selectedPersonId],
  );

  const catsRes = db.useQuery(
    person
      ? {
          cats: {
            $: {
              where: {
                "people.id": person.id,
              },
            },
          },
        }
      : null,
  );

  useEffect(() => {
    if (selectedPersonId) {
      return;
    }
    setSelectedPersonId(peopleRes.data?.people[0]?.id ?? null);
  }, [peopleRes.data]);

  return (
    <div className="p-4 text-sm font-mono flex flex-col mx-auto max-w-md gap-4">
      <strong>People</strong>
      <select
        className="text-sm p-1"
        value={selectedPersonId ?? undefined}
        onChange={(e) => setSelectedPersonId(e.target.value)}
      >
        {peopleRes.data?.people.map((person) => (
          <option key={person.id} value={person.id}>
            {person.name}
          </option>
        ))}
      </select>
      <strong>Cats</strong>
      <ul>
        {catsRes.data?.cats.map((cat) => <li key={cat.id}>{cat.name}</li>)}
      </ul>
    </div>
  );
}
