import { i, init } from '@instantdb/react';
import config from '../../config';

const schema = i.schema({
  entities: {
    colors: i.entity({ color: i.string() }),
  },
});

const db = init({ ...config, schema });

function App() {
  return <Main />;
}

function Main() {
  db.useQuery({ colors: {} });

  return (
    <div className="flex h-screen flex-col items-center justify-center space-y-4 text-center">
      <h1 className="text-4xl">Hello world</h1>
      <p className="">
        Your app, on <code className="font-mono font-bold">`localhost`</code>
      </p>
    </div>
  );
}

export default App;
