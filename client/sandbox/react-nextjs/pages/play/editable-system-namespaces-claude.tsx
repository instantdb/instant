import { provisionEphemeralApp } from '../../components/EphemeralAppPage';
import { useEffect, useState } from 'react';
import { init, id, i } from '@instantdb/admin';
import config from '../../config';

type TestResult = {
  name: string;
  status: 'success' | 'error' | 'pending';
  message: string;
  data?: any;
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

  const runTest = async (
    testId: string,
    testName: string,
    shouldFail: boolean,
    fn: () => Promise<{ data?: any; message?: string }>,
  ) => {
    updateResult(testId, {
      name: testName,
      status: 'pending',
      message: 'Running...',
    });

    try {
      const result = await fn();
      if (shouldFail) {
        updateResult(testId, {
          name: testName,
          status: 'error',
          message: '❌ Expected to fail but succeeded',
          data: result.data,
        });
      } else {
        updateResult(testId, {
          name: testName,
          status: 'success',
          message: `✅ ${result.message || 'Succeeded'}`,
          data: result.data,
        });
      }
    } catch (error: any) {
      if (shouldFail) {
        updateResult(testId, {
          name: testName,
          status: 'success',
          message: `✅ Failed as expected: ${error.message || error.body?.message || error.toString()}`,
          data: { error: error.toString() },
        });
      } else {
        updateResult(testId, {
          name: testName,
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

  // $users Tests
  const test1_addFullName = async () => {
    await runTest(
      'test1',
      '1. Add custom attr fullName to $users (via transact)',
      false,
      async () => {
        const userId = id();
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
    );
  };

  const test2_updateFullName = async () => {
    await runTest(
      'test2',
      '2. Update user data with custom fullName attr',
      false,
      async () => {
        const token = await dbWithToken.auth.createToken('bob@test.com');
        const user = await dbWithToken.auth.verifyToken(token);

        await dbWithToken.transact([
          dbWithToken.tx.$users[user.id].update({
            fullName: 'Bob Builder',
          }),
        ]);

        const data = await dbWithToken.query({
          $users: { $: { where: { id: user.id } } },
        });

        return {
          data,
          message: `Updated fullName to: ${data.$users[0]?.fullName}`,
        };
      },
    );
  };

  const test3_duplicateSystemAttr = async () => {
    await runTest(
      'test3',
      '3. Try to create attr with same name as system attr (email)',
      true,
      async () => {
        // This test checks if schema validation prevents duplicate system attr names
        // In reality, this would be caught at schema push time, not runtime
        // For now, we'll try to update with a conflicting schema
        const conflictSchema = i.schema({
          entities: {
            $users: i.entity({
              email: i.string(), // Redefining system attr
            }),
          },
        });

        // This should fail at schema validation
        return {
          message: 'Schema with duplicate system attr should be rejected',
        };
      },
    );
  };

  const test4_nonAdminUpdateEmail = async () => {
    await runTest(
      'test4',
      '4. Non-admin tries to update $users.email (system property)',
      true,
      async () => {
        const token = await dbWithToken.auth.createToken('charlie@test.com');
        const user = await dbWithToken.auth.verifyToken(token);

        // Try to update email as non-admin (using db without admin token)
        await dbNoToken.asUser({ token }).transact([
          dbNoToken.tx.$users[user.id].update({
            email: 'newemail@test.com',
          }),
        ]);

        return { message: 'Should not allow email update' };
      },
    );
  };

  const test5_adminUpdateCustomOnly = async () => {
    await runTest(
      'test5',
      '5. Admin updates $users custom attrs only',
      false,
      async () => {
        const token = await dbWithToken.auth.createToken('diana@test.com');
        const user = await dbWithToken.auth.verifyToken(token);

        await dbWithToken.transact([
          dbWithToken.tx.$users[user.id].update({
            fullName: 'Diana Prince',
          }),
        ]);

        const data = await dbWithToken.query({
          $users: { $: { where: { id: user.id } } },
        });

        return {
          data,
          message: `Admin successfully updated custom attr: ${data.$users[0]?.fullName}`,
        };
      },
    );
  };

  const test6_adminUpdateEmail = async () => {
    await runTest(
      'test6',
      '6. Admin tries to update $users.email (should fail - system property)',
      true,
      async () => {
        const token = await dbWithToken.auth.createToken('eve@test.com');
        const user = await dbWithToken.auth.verifyToken(token);

        // Even admin shouldn't be able to update system property email
        await dbWithToken.transact([
          dbWithToken.tx.$users[user.id].update({
            email: 'newemail@test.com',
          }),
        ]);

        return { message: 'Admin should not be able to update email' };
      },
    );
  };

  // $files Tests
  const test7_addIsFavorite = async () => {
    await runTest(
      'test7',
      '7. Add custom attr isFavorite to $files',
      false,
      async () => {
        // Upload a file to create a $files entry
        const buffer = new Uint8Array([1, 2, 3, 4]);
        const uploadResult = await dbWithToken.storage.uploadFile(
          'test-file.txt',
          buffer,
        );

        const fileId = uploadResult.data.id;

        // Update with custom attr
        await dbWithToken.transact([
          dbWithToken.tx.$files[fileId].update({
            isFavorite: true,
          }),
        ]);

        const data = await dbWithToken.query({
          $files: { $: { where: { id: fileId } } },
        });

        return {
          data,
          message: `Set isFavorite to: ${data.$files[0]?.isFavorite}`,
        };
      },
    );
  };

  const test8_updatePathAndCustom = async () => {
    await runTest(
      'test8',
      '8. Update file with custom isFavorite and path (editable system attr)',
      false,
      async () => {
        const buffer = new Uint8Array([5, 6, 7, 8]);
        const uploadResult = await dbWithToken.storage.uploadFile(
          'original-path.txt',
          buffer,
        );

        const fileId = uploadResult.data.id;

        // Update both path (editable system attr) and isFavorite (custom attr)
        await dbWithToken.transact([
          dbWithToken.tx.$files[fileId].update({
            path: 'new-path.txt',
            isFavorite: true,
          }),
        ]);

        const data = await dbWithToken.query({
          $files: { $: { where: { id: fileId } } },
        });

        return {
          data,
          message: `Updated path to: ${data.$files[0]?.path}, isFavorite: ${data.$files[0]?.isFavorite}`,
        };
      },
    );
  };

  const test9_updateFileSize = async () => {
    await runTest(
      'test9',
      '9. Try to update $files.size (should fail - system property, even for admin)',
      true,
      async () => {
        const buffer = new Uint8Array([9, 10, 11, 12]);
        const uploadResult = await dbWithToken.storage.uploadFile(
          'size-test.txt',
          buffer,
        );

        const fileId = uploadResult.data.id;

        // Try to update size (system property)
        await dbWithToken.transact([
          dbWithToken.tx.$files[fileId].update({
            size: 999999,
          }),
        ]);

        return { message: 'Should not allow size update' };
      },
    );
  };

  const test10_updateLocationId = async () => {
    await runTest(
      'test10',
      '10. Try to update $files.location-id (should fail - system property, even for admin)',
      true,
      async () => {
        const buffer = new Uint8Array([13, 14, 15, 16]);
        const uploadResult = await dbWithToken.storage.uploadFile(
          'location-test.txt',
          buffer,
        );

        const fileId = uploadResult.data.id;

        // Try to update location-id (system property)
        await dbWithToken.transact([
          dbWithToken.tx.$files[fileId].update({
            'location-id': 'fake-location-id',
          }),
        ]);

        return { message: 'Should not allow location-id update' };
      },
    );
  };

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">
        Editable System Namespaces Tests
      </h1>
      <p className="mb-4 text-sm text-gray-600">
        Tests that custom attributes can be added to system namespaces ($users,
        $files) while protecting system-managed fields.
      </p>

      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-3">$users Tests</h2>
        <div className="space-y-2">
          <TestButton
            onClick={test1_addFullName}
            result={results.test1}
            testId="test1"
          />
          <TestButton
            onClick={test2_updateFullName}
            result={results.test2}
            testId="test2"
          />
          <TestButton
            onClick={test3_duplicateSystemAttr}
            result={results.test3}
            testId="test3"
          />
          <TestButton
            onClick={test4_nonAdminUpdateEmail}
            result={results.test4}
            testId="test4"
          />
          <TestButton
            onClick={test5_adminUpdateCustomOnly}
            result={results.test5}
            testId="test5"
          />
          <TestButton
            onClick={test6_adminUpdateEmail}
            result={results.test6}
            testId="test6"
          />
        </div>
      </div>

      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-3">$files Tests</h2>
        <div className="space-y-2">
          <TestButton
            onClick={test7_addIsFavorite}
            result={results.test7}
            testId="test7"
          />
          <TestButton
            onClick={test8_updatePathAndCustom}
            result={results.test8}
            testId="test8"
          />
          <TestButton
            onClick={test9_updateFileSize}
            result={results.test9}
            testId="test9"
          />
          <TestButton
            onClick={test10_updateLocationId}
            result={results.test10}
            testId="test10"
          />
        </div>
      </div>
    </div>
  );
}

function TestButton({
  onClick,
  result,
  testId,
}: {
  onClick: () => void;
  result?: TestResult;
  testId: string;
}) {
  if (!result) {
    return (
      <button
        className="w-full text-left bg-gray-100 hover:bg-gray-200 px-4 py-3 rounded border border-gray-300"
        onClick={onClick}
      >
        <span className="text-gray-700">Click to run test</span>
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
    <div className={`p-3 rounded border ${bgColor}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className={textColor}>
              {result.status === 'pending' ? '⏳' : ''}
            </span>
            <div className="font-semibold">{result.name}</div>
          </div>
          <div className="text-sm mt-1">{result.message}</div>
          {result.data && (
            <details className="text-xs mt-1">
              <summary className="cursor-pointer text-gray-600">
                View data
              </summary>
              <pre className="mt-1 p-2 bg-white rounded overflow-auto max-h-40">
                {JSON.stringify(result.data, null, 2)}
              </pre>
            </details>
          )}
        </div>
        <button
          className="ml-2 text-xs bg-white px-2 py-1 rounded border hover:bg-gray-50"
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
      <div className="max-w-6xl mx-auto mt-8">
        <App app={app} />
      </div>
    );
  }
  return <div className="max-w-6xl mx-auto mt-8">Loading...</div>;
}
