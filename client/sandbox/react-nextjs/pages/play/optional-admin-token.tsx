import { provisionEphemeralApp } from '../../components/EphemeralAppPage';
import { useEffect, useState } from 'react';
import { init, id, i } from '@instantdb/admin';
import config from '../../config';

type TestResult = {
  name: string;
  status: 'success' | 'error';
  message: string;
  data?: any;
};

const schema = i.schema({
  entities: {
    goals: i.entity({
      title: i.string(),
      createdBy: i.string(),
    }),
  },
});

const perms = {
  goals: {
    allow: {
      // Admins see everything
      // Authenticated users see their own goals
      // Guests see nothing
      view: 'data.createdBy == auth.id',
      create: 'auth.id != null && auth.id == data.createdBy',
    },
  },
};

function App({ app }: { app: { id: string; 'admin-token': string } }) {
  const [results, setResults] = useState<TestResult[]>([]);
  const [running, setRunning] = useState(false);
  const userEmail = 'alice@instantdb.com';

  const runTests = async () => {
    setRunning(true);
    const testResults: TestResult[] = [];

    try {
      const appId = app.id;
      const adminToken = app['admin-token'];

      // Setup: Create some test data
      const aliceGoalId = id();
      const bobGoalId = id();

      const dbWithToken = init({
        ...config,
        appId,
        adminToken,
      });

      // Create Alice's user and token
      const bobToken = await dbWithToken.auth.createToken('bob@instantdb.com');
      const bobUser = await dbWithToken.auth.verifyToken(bobToken);
      const aliceToken = await dbWithToken.auth.createToken(userEmail);
      const aliceUser = await dbWithToken.auth.verifyToken(aliceToken);

      // Create test goals
      await dbWithToken.transact([
        dbWithToken.tx.goals[aliceGoalId].update({
          title: "Alice's goal",
          createdBy: aliceUser.id,
        }),
        dbWithToken.tx.goals[bobGoalId].update({
          title: "Bob's goal",
          createdBy: bobUser.id,
        }),
      ]);

      // Test 1: Normal query WITHOUT admin token (should fail)
      try {
        const dbNoToken = init({ ...config, appId });
        await dbNoToken.query({ goals: {} });
        testResults.push({
          name: 'Normal query WITHOUT admin token',
          status: 'error',
          message: '❌ Expected to fail but succeeded',
        });
      } catch (error: any) {
        testResults.push({
          name: 'Normal query WITHOUT admin token',
          status: 'success',
          message: `✅ Failed as expected`,
        });
      }

      // Test 2: Normal query WITH admin token (should see all goals)
      try {
        const data = await dbWithToken.query({ goals: {} });
        const goalCount = data.goals.length;
        testResults.push({
          name: 'Normal query WITH admin token',
          status: 'success',
          message: `✅ Succeeded - sees ${goalCount} goals (admin sees all)`,
          data,
        });
      } catch (error: any) {
        testResults.push({
          name: 'Normal query WITH admin token',
          status: 'error',
          message: `❌ ${error.message}`,
        });
      }

      // Test 3: asUser({token}) WITHOUT admin token (should see Alice's goals only)
      try {
        const dbNoToken = init({ ...config, appId });
        const data = await dbNoToken
          .asUser({ token: aliceToken })
          .query({ goals: {} });
        const goalCount = data.goals.length;
        testResults.push({
          name: 'asUser({token}) WITHOUT admin token',
          status: 'success',
          message: `✅ Succeeded - sees ${goalCount} goal(s) (Alice's own)`,
          data,
        });
      } catch (error: any) {
        testResults.push({
          name: 'asUser({token}) WITHOUT admin token',
          status: 'error',
          message: `❌ ${error.message}`,
        });
      }

      // Test 4: asUser({token}) WITH admin token (should see Alice's goals only)
      try {
        const data = await dbWithToken
          .asUser({ token: aliceToken })
          .query({ goals: {} });
        const goalCount = data.goals.length;
        testResults.push({
          name: 'asUser({token}) WITH admin token',
          status: 'success',
          message: `✅ Succeeded - sees ${goalCount} goal(s) (Alice's own)`,
          data,
        });
      } catch (error: any) {
        testResults.push({
          name: 'asUser({token}) WITH admin token',
          status: 'error',
          message: `❌ ${error.message}`,
        });
      }

      // Test 5: asUser({email}) WITHOUT admin token (should fail)
      try {
        const dbNoToken = init({ ...config, appId });
        await dbNoToken.asUser({ email: userEmail }).query({ goals: {} });
        testResults.push({
          name: 'asUser({email}) WITHOUT admin token',
          status: 'error',
          message: '❌ Expected to fail but succeeded',
        });
      } catch (error: any) {
        testResults.push({
          name: 'asUser({email}) WITHOUT admin token',
          status: 'success',
          message: `✅ Failed as expected`,
        });
      }

      // Test 6: asUser({email}) WITH admin token (should see Alice's goals only)
      try {
        const data = await dbWithToken
          .asUser({ email: userEmail })
          .query({ goals: {} });
        const goalCount = data.goals.length;
        testResults.push({
          name: 'asUser({email}) WITH admin token',
          status: 'success',
          message: `✅ Succeeded - sees ${goalCount} goal(s) (Alice's own)`,
          data,
        });
      } catch (error: any) {
        testResults.push({
          name: 'asUser({email}) WITH admin token',
          status: 'error',
          message: `❌ ${error.message}`,
        });
      }

      // Test 7: asUser({guest: true}) WITHOUT admin token (should see no goals)
      try {
        const dbNoToken = init({ ...config, appId });
        const data = await dbNoToken
          .asUser({ guest: true })
          .query({ goals: {} });
        const goalCount = data.goals.length;
        testResults.push({
          name: 'asUser({guest: true}) WITHOUT admin token',
          status: 'success',
          message: `✅ Succeeded - sees ${goalCount} goals (guests see none)`,
          data,
        });
      } catch (error: any) {
        testResults.push({
          name: 'asUser({guest: true}) WITHOUT admin token',
          status: 'error',
          message: `❌ ${error.message}`,
        });
      }

      // Test 8: asUser({guest: true}) WITH admin token (should see no goals)
      try {
        const data = await dbWithToken
          .asUser({ guest: true })
          .query({ goals: {} });
        const goalCount = data.goals.length;
        testResults.push({
          name: 'asUser({guest: true}) WITH admin token',
          status: 'success',
          message: `✅ Succeeded - sees ${goalCount} goals (guests see none)`,
          data,
        });
      } catch (error: any) {
        testResults.push({
          name: 'asUser({guest: true}) WITH admin token',
          status: 'error',
          message: `❌ ${error.message}`,
        });
      }
    } catch (error: any) {
      console.error('Error running tests:', error);
      testResults.push({
        name: 'Test suite error',
        status: 'error',
        message: `❌ ${error.message}`,
      });
    }

    setResults(testResults);
    setRunning(false);
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Optional Admin Token Tests</h1>
      <p className="mb-2">
        Tests that <code>adminToken</code> is optional when using{' '}
        <code>asUser(&#123;token&#125;)</code> or{' '}
        <code>asUser(&#123;guest: true&#125;)</code>, but required for normal
        queries and <code>asUser(&#123;email&#125;)</code>.
      </p>
      <p className="mb-4 text-sm text-gray-600">
        Permissions are configured so authenticated users only see their own
        goals, and guests see nothing.
      </p>

      <div className="mb-4">
        <button
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
          onClick={runTests}
          disabled={running}
        >
          {running ? 'Running...' : 'Run Tests'}
        </button>
      </div>

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((result, i) => (
            <div
              key={i}
              className={`p-3 rounded border ${
                result.status === 'success'
                  ? 'bg-green-50 border-green-200'
                  : 'bg-red-50 border-red-200'
              }`}
            >
              <div className="flex items-start">
                <span
                  className={`mr-2 ${
                    result.status === 'success'
                      ? 'text-green-600'
                      : 'text-red-600'
                  }`}
                >
                  {result.status === 'success' ? '✅' : '❌'}
                </span>
                <div className="flex-1">
                  <div className="font-semibold">{result.name}</div>
                  <div className="text-sm mt-1">{result.message}</div>
                  {result.data && (
                    <details className="text-xs mt-1">
                      <summary className="cursor-pointer">View data</summary>
                      <pre className="mt-1 p-2 bg-white rounded overflow-auto max-h-40">
                        {JSON.stringify(result.data, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Page() {
  const [app, setApp] = useState(null);
  const [error, setError] = useState<null | Error>(null);

  useEffect(() => {
    provisionEphemeralApp({ schema, perms })
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
      <div className="max-w-4xl mx-auto mt-8">
        <App app={app} />
      </div>
    );
  }
  return <div className="max-w-4xl mx-auto mt-8">Loading...</div>;
}
