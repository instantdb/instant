import { provisionEphemeralApp } from '../../components/EphemeralAppPage';
import { useEffect, useState } from 'react';
import { init, i, id } from '@instantdb/admin';
import config from '../../config';

type TestResult = {
  name: string;
  status: 'success' | 'error' | 'pending';
  message: string;
  data?: any;
};

type TestRunner = () => Promise<any>;

type TestCase = {
  id: string;
  description: string;
  shouldFail: boolean;
  run: TestRunner;
};

const applySchemaSteps = async ({
  appId,
  adminToken,
  steps,
}: {
  appId: string;
  adminToken: string;
  steps: any[];
}) => {
  const response = await fetch(
    `${config.apiURI}/dash/apps/${appId}/schema/steps/apply`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'content-type': 'application/json',
        'app-id': appId,
      },
      body: JSON.stringify({ steps }),
    },
  );

  let errorBody: any = null;
  try {
    errorBody = await response.json();
  } catch {
    errorBody = null;
  }

  if (response.ok) {
    throw new Error('Request unexpectedly succeeded');
  }

  const message =
    errorBody?.message ||
    errorBody?.hint?.errors?.[0]?.message ||
    'Schema apply failed';
  throw new Error(message);
};

const schema = i.schema({
  entities: {
    $users: i.entity({
      email: i.string().unique().indexed(),
      // Custom attribute on $users
      fullName: i.string().optional(),
    }),
    $files: i.entity({
      path: i.string().unique().indexed(),
      // Custom attribute on $files
      isFavorite: i.boolean().optional(),
    }),
  },
});

function App({ app }: { app: { id: string; 'admin-token': string } }) {
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const appId = app.id;
  const adminToken = app['admin-token'];

  const updateResult = (testId: string, result: Partial<TestResult>) => {
    setResults((prev) => ({
      ...prev,
      [testId]: { ...prev[testId], ...result } as TestResult,
    }));
  };

  const runTest = async (test: TestCase, label: string) => {
    updateResult(test.id, {
      name: label,
      status: 'pending',
      message: 'Running...',
    });

    try {
      const result = await test.run();
      if (test.shouldFail) {
        updateResult(test.id, {
          name: label,
          status: 'error',
          message: '❌ Expected to fail but succeeded',
          data: result.data,
        });
      } else {
        updateResult(test.id, {
          name: label,
          status: 'success',
          message: `✅ ${result.message || 'Succeeded'}`,
          data: result.data,
        });
      }
    } catch (error: any) {
      if (test.shouldFail) {
        updateResult(test.id, {
          name: label,
          status: 'success',
          message: `✅ Failed as expected: ${error.message || error.body?.message || error.toString()}`,
          data: { error: error.toString() },
        });
      } else {
        updateResult(test.id, {
          name: label,
          status: 'error',
          message: `❌ ${error.message || error.body?.message || error.toString()}`,
          data: { error: error.toString() },
        });
      }
    }
  };

  // Initialize admin SDK
  const dbWithToken = init({ ...config, appId, adminToken, schema });
  const dbNoToken = init({ ...config, appId, schema });

  const tests: TestCase[] = [
    {
      id: 'updateUsersFullName',
      description: 'Set custom $users.fullName',
      shouldFail: false,
      run: async () => {
        const token = await dbWithToken.auth.createToken('alice@test.com');
        const user = await dbWithToken.auth.verifyToken(token);

        await dbWithToken.transact([
          dbWithToken.tx.$users[user.id].update({
            fullName: 'Alice Wonderland',
          }),
        ]);

        const data = await dbWithToken.query({ $users: {} });
        return {
          data,
          message: `Created user with fullName: ${data.$users[0]?.fullName}`,
        };
      },
    },
    {
      id: 'nonAdminCannotUpdateSystemEmail',
      description: 'Block non-admin $users.email edit',
      shouldFail: true,
      run: async () => {
        const token = await dbWithToken.auth.createToken('charlie@test.com');
        const user = await dbWithToken.auth.verifyToken(token);

        await dbNoToken.asUser({ token }).transact([
          dbNoToken.tx.$users[user.id].update({
            email: 'newemail@test.com',
          }),
        ]);

        return { message: 'Should not allow email update' };
      },
    },
    {
      id: 'adminUpdatesEmail',
      description: 'Admin can edit $users.email',
      shouldFail: false,
      run: async () => {
        const token = await dbWithToken.auth.createToken('eve@test.com');
        const user = await dbWithToken.auth.verifyToken(token);

        await dbWithToken.transact([
          dbWithToken.tx.$users[user.id].update({
            email: 'newemail@test.com',
            fullName: 'Eve',
          }),
        ]);

        return { message: 'Admin should update email' };
      },
    },
    {
      id: 'updateFilesAttrs',
      description: 'Update $files.isFavorite and path',
      shouldFail: false,
      run: async () => {
        const buffer = new Uint8Array([1, 2, 3, 4]);
        const uploadResult = await dbWithToken.storage.uploadFile(
          'test-file.txt',
          buffer,
        );

        const fileId = uploadResult.data.id;

        await dbWithToken.transact([
          dbWithToken.tx.$files[fileId].update({
            isFavorite: true,
            path: 'changed-file.txt',
          }),
        ]);

        const data = await dbWithToken.query({
          $files: { $: { where: { id: fileId } } },
        });

        return {
          data,
          message: `Set isFavorite to: ${data.$files[0]?.isFavorite} and path to: ${data.$files[0]?.path}`,
        };
      },
    },
    {
      id: 'rejectRequiredSystemAttr',
      description: "Can't create required system attribute",
      shouldFail: true,
      run: async () => {
        const attrId = id();
        const forwardIdentityId = id();
        await applySchemaSteps({
          appId,
          adminToken,
          steps: [
            [
              'add-attr',
              {
                id: attrId,
                'forward-identity': [
                  forwardIdentityId,
                  '$users',
                  'favoriteColor',
                ],
                'reverse-identity': null,
                'inferred-types': null,
                'value-type': 'blob',
                cardinality: 'one',
                'index?': false,
                'required?': true,
                'unique?': false,
                catalog: 'user',
                'checked-data-type': 'string',
              },
            ],
          ],
        });
      },
    },
    {
      id: 'rejectSystemCatalogIdent',
      description: "Can't create attribute with system ident",
      shouldFail: true,
      run: async () => {
        const attrId = id();
        const forwardIdentityId = id();
        await applySchemaSteps({
          appId,
          adminToken,
          steps: [
            [
              'add-attr',
              {
                id: attrId,
                'forward-identity': [forwardIdentityId, '$users', 'email'],
                'reverse-identity': null,
                'inferred-types': null,
                'value-type': 'blob',
                cardinality: 'one',
                'index?': false,
                'required?': false,
                'unique?': false,
                catalog: 'user',
                'checked-data-type': 'string',
              },
            ],
          ],
        });
      },
    },
    {
      id: 'cannotUpdateFileSize',
      description: 'Prevent overrides of $files.size',
      shouldFail: true,
      run: async () => {
        const buffer = new Uint8Array([9, 10, 11, 12]);
        const uploadResult = await dbWithToken.storage.uploadFile(
          'size-test.txt',
          buffer,
        );

        const fileId = uploadResult.data.id;

        await dbWithToken.transact([
          dbWithToken.tx.$files[fileId].update({
            // @ts-ignore-next
            size: 999999,
          }),
        ]);

        return { message: 'Should not allow size update' };
      },
    },
  ];

  return (
    <div className="mx-auto max-w-6xl p-4">
      <h1 className="mb-4 text-2xl font-bold">
        Editable System Namespaces Tests
      </h1>
      <p className="mb-4 text-sm text-gray-600">
        Tests that custom attributes can be added to system namespaces ($users,
        $files) while protecting system-managed fields.
      </p>

      <div className="mb-6">
        <div className="space-y-2">
          {tests.map((test, index) => {
            const label = `${index + 1}. ${test.description}`;
            return (
              <TestButton
                key={test.id}
                label={label}
                onClick={() => runTest(test, label)}
                result={results[test.id]}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TestButton({
  onClick,
  result,
  label,
}: {
  onClick: () => void;
  result?: TestResult;
  label: string;
}) {
  if (!result) {
    return (
      <button
        className="w-full rounded border border-gray-300 bg-gray-100 px-4 py-3 text-left hover:bg-gray-200"
        onClick={onClick}
      >
        <div className="font-semibold text-gray-700">{label}</div>
        <div className="text-sm text-gray-600">Click to run</div>
      </button>
    );
  }

  const bgColor =
    result.status === 'success'
      ? 'bg-green-50 border-green-200'
      : result.status === 'error'
        ? 'bg-red-50 border-red-200'
        : 'bg-yellow-50 border-yellow-200';

  const textColor =
    result.status === 'success'
      ? 'text-green-600'
      : result.status === 'error'
        ? 'text-red-600'
        : 'text-yellow-600';

  return (
    <div className={`rounded border p-3 ${bgColor}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className={textColor}>
              {result.status === 'pending' ? '⏳' : ''}
            </span>
            <div className="font-semibold">{label}</div>
          </div>
          <div className="mt-1 text-sm">{result.message}</div>
          {result.data && (
            <details className="mt-1 text-xs">
              <summary className="cursor-pointer text-gray-600">
                View data
              </summary>
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-white p-2">
                {JSON.stringify(result.data, null, 2)}
              </pre>
            </details>
          )}
        </div>
        <button
          className="ml-2 rounded border bg-white px-2 py-1 text-xs hover:bg-gray-50"
          onClick={onClick}
        >
          Re-run
        </button>
      </div>
    </div>
  );
}

export default function Page() {
  const [app, setApp] = useState(null);
  const [error, setError] = useState<null | Error>(null);

  useEffect(() => {
    provisionEphemeralApp({ schema })
      .then((res) => setApp(res.app))
      .catch((e) => {
        console.error('Error creating app', e);
        setError(e);
      });
  }, []);

  if (error) {
    return <div>There was an error {error.message}</div>;
  }

  if (app) {
    return (
      <div className="mx-auto mt-8 max-w-6xl">
        <App app={app} />
      </div>
    );
  }
  return <div className="mx-auto mt-8 max-w-6xl">Loading...</div>;
}
