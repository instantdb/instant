import { useEffect, useState } from 'react';
import config from '../../config';
import { init, tx, id, i } from '@instantdb/react';
import { useRouter } from 'next/router';
import { InstaQLFields } from '../../../../packages/core/dist/module';

const _schema = i.schema({
  entities: {
    characters: i.entity({
      name: i.string().unique().indexed(),
      showName: i.string().indexed(),
      sex: i.string(),
      description: i.string(),
      rating: i.number().indexed(),
    }),
    $users: i.entity({
      email: i.string().unique().indexed(),
    }),
  },
});

type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

const defaultFields: InstaQLFields<AppSchema, 'characters'> = [
  'id',
  'name',
  'showName',
  'sex',
  'description',
  'rating',
];

function Example({ appId }: { appId: string }) {
  const router = useRouter();
  const myConfig = { ...config, appId, schema };
  const db = init(myConfig);

  const [fields, setFields] =
    useState<InstaQLFields<AppSchema, 'characters'>>(defaultFields);
  const [noFields, setNoFields] = useState(false);

  const { data } = db.useQuery({
    characters: {
      $: { fields: noFields ? undefined : fields },
    },
  });

  const { data: ratingData } = db.useQuery({
    characters: {
      $: {
        fields: noFields ? undefined : fields,
        where: { rating: { $gt: 7 } },
      },
    },
  });

  return (
    <div>
      <div>
        <button
          className="bg-black text-white m-2 p-2"
          onClick={() => {
            window.location.href = router.pathname;
          }}
        >
          Start over
        </button>
      </div>
      <div>
        {defaultFields.map((field) => {
          const hasField = fields.includes(field);
          return (
            <button
              className="bg-black font-mono text-white m-2 p-2 "
              key={field}
              onClick={() => {
                if (hasField) {
                  setFields(fields.filter((x) => x !== field));
                } else {
                  setFields([...fields, field]);
                }
              }}
            >
              {hasField ? '-' : '+'} {field}
            </button>
          );
        })}
      </div>
      <div>
        <button
          className="bg-black text-white m-2 p-2"
          onClick={() => {
            setNoFields(!noFields);
          }}
        >
          {noFields ? 'Add fields arg' : 'Remove fields arg'}
        </button>
      </div>
      <div className="p-2"></div>
      <div className="flex">
        <div className="p-2">
          <details open>
            <summary>All characters</summary>

            {data?.characters?.map((item, i) => (
              <div className="p-2" key={i}>
                {Object.entries(item).map(([k, v]) => (
                  <div key={k}>
                    <span>{k}:</span> <span>{v}</span>
                  </div>
                ))}
              </div>
            ))}
          </details>
        </div>
        <div className="p-2">
          <details open>
            <summary>High rating characters</summary>

            {ratingData?.characters?.map((item, i) => (
              <div className="p-2" key={i}>
                {Object.entries(item).map(([k, v]) => (
                  <div key={k}>
                    <span>{k}:</span> <span>{v}</span>
                  </div>
                ))}
              </div>
            ))}
          </details>
        </div>
      </div>
    </div>
  );
}

const characters = [
  {
    name: 'George Costanza',
    showName: 'Seinfeld',
    sex: 'Male',
    description: 'A real buffoon navigating life’s absurdities.',
    rating: 8,
  },
  {
    name: 'Chandler Bing',
    showName: 'Friends',
    sex: 'Male',
    description: 'Sarcastic and quick-witted in every situation.',
    rating: 2,
  },
  {
    name: 'Will Smith',
    showName: 'The Fresh Prince of Bel-Air',
    sex: 'Male',
    description: 'A street-smart, humorous teen turned city prince.',
    rating: 5,
  },
  {
    name: 'Homer Simpson',
    showName: 'The Simpsons',
    sex: 'Male',
    description: 'Lovable, bumbling dad with a penchant for donuts.',
    rating: 6,
  },
  {
    name: 'Sam Malone',
    showName: 'Cheers',
    sex: 'Male',
    description: 'A charming bartender with a roguish streak.',
    rating: 8,
  },
  {
    name: 'Frasier Crane',
    showName: 'Frasier',
    sex: 'Male',
    description: 'A refined, neurotic radio psychiatrist.',
    rating: 8,
  },
  {
    name: 'Hawkeye Pierce',
    showName: 'M*A*S*H',
    sex: 'Male',
    description: 'Witty and irreverent surgeon in a war zone.',
    rating: 9,
  },
  {
    name: 'Lucy Ricardo',
    showName: 'I Love Lucy',
    sex: 'Female',
    description: 'Energetic housewife with a flair for mischief.',
    rating: 7,
  },
  {
    name: 'Mary Richards',
    showName: 'The Mary Tyler Moore Show',
    sex: 'Female',
    description: 'Independent and determined newsroom professional.',
    rating: 8,
  },
  {
    name: 'Alex Reiger',
    showName: 'Taxi',
    sex: 'Male',
    description: 'Level-headed cab driver amidst eccentric coworkers.',
    rating: 7,
  },
  {
    name: 'Fonzie',
    showName: 'Happy Days',
    sex: 'Male',
    description: 'Cool, iconic greaser with a heart of gold.',
    rating: 9,
  },
  {
    name: 'Dorothy Zbornak',
    showName: 'The Golden Girls',
    sex: 'Female',
    description: 'Witty, wise, and refreshingly candid.',
    rating: 8,
  },
  {
    name: 'Roseanne Conner',
    showName: 'Roseanne',
    sex: 'Female',
    description: 'Tough, honest, and navigating family life with humor.',
    rating: 2,
  },
  {
    name: 'Al Bundy',
    showName: 'Married... with Children',
    sex: 'Male',
    description: 'Cynical shoe salesman with a streak of misfortune.',
    rating: 7,
  },
  {
    name: 'Steve Urkel',
    showName: 'Family Matters',
    sex: 'Male',
    description: 'Lovable nerd known for his catchphrases and antics.',
    rating: 8,
  },
  {
    name: 'Joey Gladstone',
    showName: 'Full House',
    sex: 'Male',
    description: 'Fun-loving comedian and supportive friend.',
    rating: 8,
  },
  {
    name: 'Mike Seaver',
    showName: 'Growing Pains',
    sex: 'Male',
    description: 'Rebellious yet charming older sibling.',
    rating: 7,
  },
  {
    name: 'Tim Taylor',
    showName: 'Home Improvement',
    sex: 'Male',
    description: 'Booming TV host prone to DIY disasters.',
    rating: 8,
  },
  {
    name: 'Ray Barone',
    showName: 'Everybody Loves Raymond',
    sex: 'Male',
    description: 'Relatable everyman with a quirky family dynamic.',
    rating: 6,
  },
  {
    name: 'Will Truman',
    showName: 'Will & Grace',
    sex: 'Male',
    description: 'Charming lawyer with a dry wit navigating life and love.',
    rating: 1,
  },
];

async function provisionEphemeralApp() {
  const r = await fetch(`${config.apiURI}/dash/apps/ephemeral`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: 'Comparisons example',
    }),
  });

  const res = await r.json();
  if (res.app) {
    const db = init({ ...config, appId: res.app.id, schema: schema });
    db.transact(
      characters.map((character) => db.tx.characters[id()].update(character)),
    );
  }
  return res;
}

async function verifyEphemeralApp({ appId }: { appId: string }) {
  const r = await fetch(`${config.apiURI}/dash/apps/ephemeral/${appId}`, {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  return r.json();
}

function App({ urlAppId }: { urlAppId: string | undefined }) {
  const router = useRouter();
  const [appId, setAppId] = useState();

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (appId) {
      return;
    }
    if (urlAppId) {
      verifyEphemeralApp({ appId: urlAppId }).then((res): any => {
        if (res.app) {
          setAppId(res.app.id);
        } else {
          provisionEphemeralApp().then((res) => {
            if (res.app) {
              router.replace({
                pathname: router.pathname,
                query: { ...router.query, app: res.app.id },
              });

              setAppId(res.app.id);
            } else {
              console.log(res);
              setError('Could not create app.');
            }
          });
        }
      });
    } else {
      provisionEphemeralApp().then((res) => {
        if (res.app) {
          router.replace({
            pathname: router.pathname,
            query: { ...router.query, app: res.app.id },
          });

          setAppId(res.app.id);
        } else {
          console.log(res);
          setError('Could not create app.');
        }
      });
    }
  }, []);

  if (error) {
    return (
      <div>
        <p>There was an error</p>
        <p>{error}</p>
      </div>
    );
  }

  if (!appId) {
    return <div>Loading...</div>;
  }
  return <Example appId={appId} />;
}

function Page() {
  const router = useRouter();
  if (router.isReady) {
    return <App urlAppId={router.query.app as string} />;
  } else {
    return <div>Loading...</div>;
  }
}

export default Page;
