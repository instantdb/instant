import { useAuthToken } from '@/lib/auth';
import { getLocal } from '@/lib/config';
import { flags } from '@/lib/flags';
import { useIsHydrated } from '@/lib/hooks/useIsHydrated';
import { useEffect, useState } from 'react';

export function Dev() {
  const [authTokens, setAuthTokens] = useState<
    { name: string; token: string; prod: boolean }[]
  >([]);
  const [flagStates, setFlagStates] = useState<{ [key: string]: boolean }>({});
  const [isDevBackend, setIsDevBackend] = useState<boolean>(false);

  const isHydrated = useIsHydrated();
  const currentToken = useAuthToken();
  const [open, setOpen] = useState(false);

  function toggleOpen(e: KeyboardEvent) {
    if (e.key === '9' && e.shiftKey && e.metaKey) {
      setOpen((_) => !_);
    }
  }

  useEffect(() => {
    setIsDevBackend(Boolean(localStorage.getItem('devBackend')));
    setAuthTokens(getLocal('__instant__authTokens') ?? []);
    setFlagStates(
      Object.fromEntries(
        Object.keys(flags).map((k) => [
          k,
          getLocal(`__instant__flag__${k}`) ?? false,
        ]),
      ),
    );

    document.addEventListener('keydown', toggleOpen);
    return () => document.removeEventListener('keydown', toggleOpen);
  }, []);

  if (!isHydrated || !open) return null;

  return (
    <div className="fixed bottom-2 right-2 top-2 z-50 flex w-full max-w-md flex-col gap-4 overflow-auto border bg-gray-50 p-5 font-mono shadow-lg">
      <h2 className="text-lg font-bold">Instant WWW Devtools</h2>

      <div>
        <h3 className="font-bold">Backend</h3>

        <div className="flex gap-2">
          {isDevBackend ? (
            <button
              className="bg-red-400 px-2 py-0.5 text-white"
              onClick={() => {
                setTokenAndReload(undefined, false);
              }}
            >
              Switch to Prod
            </button>
          ) : (
            <button
              className="bg-emerald-400 px-2 py-0.5 text-white"
              onClick={() => {
                setTokenAndReload(undefined, true);
              }}
            >
              Switch to Dev
            </button>
          )}
        </div>
      </div>

      <div>
        <h3 className="font-bold">Feature flags</h3>
        {Object.keys(flagStates).length ? (
          Object.entries(flagStates).map(([name, active]) => (
            <div key={name}>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  className="cursor-pointer"
                  name={name}
                  checked={active}
                  onChange={(e) => {
                    const k = `__instant__flag__${name}`;

                    if (e.currentTarget.checked) {
                      localStorage.setItem(k, 'true');
                    } else {
                      localStorage.removeItem(k);
                    }

                    location.reload();
                  }}
                />{' '}
                {name}
              </label>
            </div>
          ))
        ) : (
          <div className="italic text-gray-400">No flags</div>
        )}
      </div>

      <div>
        <h3 className="font-bold">Auth tokens</h3>
        <div className="flex flex-col gap-1">
          {authTokens.length ? (
            authTokens.map((p) => (
              <div key={p.name} className="flex items-center justify-between">
                <div>
                  {p.name}{' '}
                  <span className="italic text-gray-400">
                    ({p.prod ? 'Prod' : 'Dev'})
                  </span>
                </div>
                <div className="flex gap-1">
                  <button
                    className="bg-black px-2 py-0.5 text-white"
                    onClick={() => {
                      setTokenAndReload(p.token, p.prod);
                    }}
                  >
                    Switch
                  </button>
                  <button
                    className="bg-black px-2 py-0.5 text-white"
                    onClick={() => {
                      const nextTokens = authTokens.filter(
                        (t) => t.token !== p.token,
                      );

                      setAuthTokens(nextTokens);

                      localStorage.setItem(
                        '__instant__authTokens',
                        JSON.stringify(nextTokens),
                      );
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="italic text-gray-400">No auth tokens</div>
          )}
        </div>
      </div>

      {currentToken ? (
        <div className="flex flex-col space-y-1">
          <div className="flex space-x-2">
            <h3 className="font-bold">Current auth token</h3>
            <button
              className="bg-red-400 px-2 py-0.5 text-white"
              onClick={() => {
                setToken(undefined);
                location.reload();
              }}
            >
              Clear
            </button>
          </div>
          <span className="text-gray-800">{currentToken}</span>
        </div>
      ) : null}

      {currentToken ? (
        <div>
          <h3 className="font-bold">Save the current auth token</h3>
          <form
            className="flex flex-col gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              e.currentTarget.reset();

              const token = currentToken;
              if (!token) return;

              const name = fd.get('name') as string;
              const prod = Boolean(localStorage.getItem('devBackend'));

              const nextTokens = [
                ...authTokens,
                {
                  name,
                  token,
                  prod,
                },
              ];

              setAuthTokens(nextTokens);

              localStorage.setItem(
                '__instant__authTokens',
                JSON.stringify(nextTokens),
              );
            }}
          >
            <input
              type="text"
              name="name"
              placeholder="Name"
              className="w-full border-gray-400 px-2 py-0.5"
            />
            <button type="submit" className="w-full bg-black p-1 text-white">
              Save token
            </button>
          </form>
        </div>
      ) : null}

      <div>
        <h3 className="font-bold">Add auth token</h3>
        <form
          className="flex flex-col gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);

            const name = fd.get('name');
            const token = fd.get('token') as string;
            const prod = Boolean(fd.get('token') as string);

            if (!name || !token) return;

            localStorage.setItem(
              '__instant__authTokens',
              JSON.stringify([
                ...authTokens,
                {
                  name,
                  token,
                  prod,
                },
              ]),
            );

            setTokenAndReload(token);
          }}
        >
          <input
            type="text"
            name="name"
            placeholder="Name"
            className="w-full border-gray-400 px-2 py-0.5"
          />
          <input
            type="text"
            name="token"
            placeholder="Token"
            className="w-full border-gray-400 px-2 py-0.5"
          />
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="prod" /> From Prod backend
          </label>
          <button type="submit" className="w-full bg-black p-1 text-white">
            Add and use token
          </button>
        </form>
      </div>
    </div>
  );
}

function setToken(token?: string) {
  if (token) {
    localStorage.setItem(
      '@AUTH',
      JSON.stringify({
        token,
      }),
    );
  } else {
    localStorage.removeItem('@AUTH');
  }
}

function setTokenAndReload(token?: string, prod?: boolean) {
  setToken(token);

  if (prod) {
    localStorage.setItem('devBackend', 'true');
  } else {
    localStorage.removeItem('devBackend');
  }

  location.reload();
}
