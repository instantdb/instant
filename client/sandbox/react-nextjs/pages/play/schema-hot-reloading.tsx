import { i, init } from '@instantdb/react';
import config from '../../config';
import { useEffect, useState } from 'react';

const schema = i.schema({
  entities: {
    posts: i.entity({ title1: i.string() }),
  },
});

const db = init({ ...config, schema });

function App() {
  const queryResult = db.useQuery({ posts: {} });

  const [currSchema, setCurrSchema] = useState<any>(null);
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrSchema(db._core._reactor.config.schema);
    }, 1000);
    return () => clearInterval(interval);
  }, [db]);
  return (
    <div>
      <h1>Schema Hot Reloading!!</h1>
      <div>
        Schema:
        <pre>{JSON.stringify(currSchema, null, 2)}</pre>
      </div>
      <div>
        Posts:
        <pre>{JSON.stringify({ queryResult }, null, 2)}</pre>
      </div>
    </div>
  );
}

export default App;
