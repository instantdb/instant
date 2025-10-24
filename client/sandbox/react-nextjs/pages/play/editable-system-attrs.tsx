import { provisionEphemeralApp } from '../../components/EphemeralAppPage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { init, id } from '@instantdb/admin';
import config from '../../config';

type TestRunResult = {
  status: 'pending' | 'success' | 'error';
  message: string;
  detail?: any;
};

type PlayTest = {
  id: string;
  name: string;
  description?: string;
  shouldFail?: boolean;
  run: () => Promise<{ message?: string; detail?: any } | void>;
};

type PlayTestGroup = {
  title: string;
  tests: PlayTest[];
};

type AppSummary = { id: string; 'admin-token': string };

function toErrorMessage(err: any) {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err.body?.errors?.length) {
    const first = err.body.errors[0];
    if (typeof first === 'string') return first;
    if (first?.message) return first.message;
  }
  if (err.body?.issues?.length) {
    const first = err.body.issues[0];
    if (first?.message) return first.message;
  }
  if (err.body?.message) return err.body.message;
  if (err.message) return err.message;
  return JSON.stringify(err);
}

function encodeBody(body: any) {
  return JSON.stringify(body, (_, value) =>
    typeof value === 'bigint' ? value.toString() : value,
  );
}

function useEditableSystemAttrTests(app: AppSummary) {
  const appId = app.id;
  const adminToken = app['admin-token'];

  const adminDb = useMemo(
    () =>
      init({
        ...config,
        appId,
        adminToken,
        disableValidation: true,
      }),
    [appId, adminToken],
  );

  const userDb = useMemo(
    () =>
      init({
        ...config,
        appId,
        disableValidation: true,
      }),
    [appId],
  );

  const adminFetch = useCallback(
    async (path: string, init?: RequestInit) => {
      const response = await fetch(`${config.apiURI}${path}`, {
        method: init?.method ?? 'GET',
        headers: {
          'content-type': 'application/json',
          'app-id': appId,
          authorization: `Bearer ${adminToken}`,
          ...(init?.headers ?? {}),
        },
        body: init?.body,
      });

      const text = await response.text();
      let body: any = null;
      if (text) {
        try {
          body = JSON.parse(text);
        } catch (e) {
          body = { message: text };
        }
      }

      if (!response.ok) {
        const error: any = new Error(
          body?.message || response.statusText || 'Request failed',
        );
        error.body = body;
        throw error;
      }

      return body;
    },
    [adminToken, appId],
  );

  const adminTransact = useCallback(
    async (steps: any[]) => {
      return adminFetch('/admin/transact', {
        method: 'POST',
        body: encodeBody({ steps, 'throw-on-missing-attrs?': false }),
      });
    },
    [adminFetch],
  );

  const fetchSchema = useCallback(async () => {
    const data = await adminFetch('/admin/schema');
    return data?.schema ?? {};
  }, [adminFetch]);

  const getBlobAttr = useCallback(
    async (namespace: string, attrName: string) => {
      const schema = await fetchSchema();
      const ns = schema?.blobs?.[namespace];
      return ns?.[attrName];
    },
    [fetchSchema],
  );

  const ensureBlobAttr = useCallback(
    async (
      namespace: string,
      attrName: string,
      opts: {
        index?: boolean;
        unique?: boolean;
        required?: boolean;
        checkedDataType?: 'string' | 'boolean' | 'number';
      } = {},
    ) => {
      const existing = await getBlobAttr(namespace, attrName);
      if (existing) {
        return { attr: existing, created: false };
      }

      const attrId = id();
      const identityId = id();
      const attrPayload: any = {
        id: attrId,
        'forward-identity': [identityId, namespace, attrName],
        'value-type': 'blob',
        cardinality: 'one',
        'unique?': !!opts.unique,
        'index?': !!opts.index,
        'required?': !!opts.required,
      };
      if (opts.checkedDataType) {
        attrPayload['checked-data-type'] = opts.checkedDataType;
      }

      await adminTransact([['add-attr', attrPayload]]);
      const fresh = await getBlobAttr(namespace, attrName);
      if (!fresh) {
        throw new Error(`Attribute ${namespace}.${attrName} was not created`);
      }
      return { attr: fresh, created: true };
    },
    [adminTransact, getBlobAttr],
  );

  const createTestUser = useCallback(
    async (label: string) => {
      const email = `${label}-${Date.now()}@example.com`;
      const token = await adminDb.auth.createToken(email);
      const user = await adminDb.auth.verifyToken(token);
      return { email, token, user };
    },
    [adminDb],
  );

  const uploadFileForUser = useCallback(
    async (token: string, filename: string) => {
      const payload = new TextEncoder().encode(`file-${Date.now()}`);
      const impersonated = adminDb.asUser({ token });
      const uploadResult = await impersonated.storage.uploadFile(
        filename,
        payload,
      );
      return uploadResult.data;
    },
    [adminDb],
  );

  const groups = useMemo<PlayTestGroup[]>(() => {
    const tests: PlayTestGroup[] = [
      {
        title: 'Schema mutations',
        tests: [
          {
            id: 'add-users-fullname',
            name: 'Add $users.fullName attribute',
            run: async () => {
              const { created, attr } = await ensureBlobAttr(
                '$users',
                'fullName',
                {
                  checkedDataType: 'string',
                },
              );
              return {
                message: created
                  ? 'Created custom attribute on $users'
                  : 'Attribute already exists',
                detail: { id: attr.id, index: attr['index?'] },
              };
            },
          },
          {
            id: 'add-files-isfavorite',
            name: 'Add $files.isFavorite attribute',
            run: async () => {
              const { created, attr } = await ensureBlobAttr(
                '$files',
                'isFavorite',
                {
                  checkedDataType: 'boolean',
                },
              );
              return {
                message: created
                  ? 'Created custom attribute on $files'
                  : 'Attribute already exists',
                detail: { id: attr.id, index: attr['index?'] },
              };
            },
          },
          {
            id: 'index-users-fullname',
            name: 'Mark $users.fullName as indexed',
            run: async () => {
              const { attr } = await ensureBlobAttr('$users', 'fullName', {
                checkedDataType: 'string',
              });
              if (attr['index?']) {
                return { message: 'Attribute already indexed' };
              }
              await adminTransact([
                ['update-attr', { id: attr.id, 'index?': true }],
              ]);
              const updated = await getBlobAttr('$users', 'fullName');
              return {
                message: 'Updated attribute to be indexed',
                detail: { index: updated?.['index?'] },
              };
            },
          },
          {
            id: 'duplicate-system-name',
            name: 'Attempt to add $users.email attribute (should fail)',
            shouldFail: true,
            run: async () => {
              const attrPayload = {
                id: id(),
                'forward-identity': [id(), '$users', 'email'],
                'value-type': 'blob',
                cardinality: 'one',
                'unique?': false,
                'index?': false,
              };
              await adminTransact([['add-attr', attrPayload]]);
            },
          },
          {
            id: 'create-other-system-namespace',
            name: 'Attempt to add $magicCodes.extra attr (should fail)',
            shouldFail: true,
            run: async () => {
              const attrPayload = {
                id: id(),
                'forward-identity': [id(), '$magicCodes', 'extra'],
                'value-type': 'blob',
                cardinality: 'one',
                'unique?': false,
                'index?': false,
              };
              await adminTransact([['add-attr', attrPayload]]);
            },
          },
          {
            id: 'delete-system-attr',
            name: 'Attempt to delete $users.email attribute (should fail)',
            shouldFail: true,
            run: async () => {
              const emailAttr = await getBlobAttr('$users', 'email');
              if (!emailAttr) {
                throw new Error('Unable to locate $users.email attribute');
              }
              await adminTransact([['delete-attr', emailAttr.id]]);
            },
          },
        ],
      },
      {
        title: '$users enforcement',
        tests: [
          {
            id: 'user-updates-custom',
            name: 'User updates own $users.fullName',
            run: async () => {
              await ensureBlobAttr('$users', 'fullName', {
                checkedDataType: 'string',
              });
              const { user, token } = await createTestUser('custom-user');
              const newName = `User ${Date.now()}`;
              await userDb.asUser({ token }).transact([
                userDb.tx.$users[user.id].update({
                  fullName: newName,
                }),
              ]);
              const { $users } = await adminDb.query({
                $users: { $: { where: { id: user.id } } },
              });
              return {
                message: 'Updated custom attribute as user',
                detail: $users?.[0],
              };
            },
          },
          {
            id: 'user-updates-email',
            name: 'User tries to update $users.email (should fail)',
            shouldFail: true,
            run: async () => {
              const { user, token } = await createTestUser('email-guard');
              await userDb.asUser({ token }).transact([
                userDb.tx.$users[user.id].update({
                  email: `new-${Date.now()}@example.com`,
                }),
              ]);
            },
          },
          {
            id: 'admin-crud-users',
            name: 'Admin updates $users.email',
            run: async () => {
              const { user } = await createTestUser('admin-crud');
              const updatedEmail = `updated-${Date.now()}@example.com`;
              await adminDb.transact([
                adminDb.tx.$users[user.id].update({
                  email: updatedEmail,
                }),
              ]);
              const { $users } = await adminDb.query({
                $users: { $: { where: { id: user.id } } },
              });
              return {
                message: 'Admin updated system column successfully',
                detail: $users?.[0],
              };
            },
          },
        ],
      },
      {
        title: '$files enforcement',
        tests: [
          {
            id: 'user-updates-files-custom',
            name: 'User updates $files.isFavorite and path',
            run: async () => {
              await ensureBlobAttr('$files', 'isFavorite', {
                checkedDataType: 'boolean',
              });
              const { token, user } = await createTestUser('file-owner');
              const file = await uploadFileForUser(
                token,
                `user-file-${Date.now()}.txt`,
              );
              await userDb.asUser({ token }).transact([
                userDb.tx.$files[file.id].update({
                  path: `renamed-${Date.now()}.txt`,
                  isFavorite: true,
                }),
              ]);
              const result = await adminDb.query({
                $files: { $: { where: { id: file.id } } },
              });
              return {
                message: 'Updated path and custom column as user',
                detail: {
                  userId: user.id,
                  file: result.$files?.[0],
                },
              };
            },
          },
          {
            id: 'admin-updates-location',
            name: 'Admin tries to update $files.location-id (should fail)',
            shouldFail: true,
            run: async () => {
              const { token } = await createTestUser('file-guard');
              const file = await uploadFileForUser(
                token,
                `guard-file-${Date.now()}.txt`,
              );
              await adminDb.transact([
                adminDb.tx.$files[file.id].update({
                  'location-id': 'fake-location',
                }),
              ]);
            },
          },
        ],
      },
    ];

    return tests;
  }, [
    adminDb,
    adminTransact,
    createTestUser,
    ensureBlobAttr,
    getBlobAttr,
    uploadFileForUser,
    userDb,
  ]);

  return { groups };
}

function TestCard({
  test,
  result,
  onRun,
}: {
  test: PlayTest;
  result?: TestRunResult;
  onRun: () => void;
}) {
  const statusColor =
    result?.status === 'success'
      ? 'border-green-200 bg-green-50'
      : result?.status === 'error'
        ? 'border-red-200 bg-red-50'
        : 'border-gray-200 bg-white';

  const statusIcon =
    result?.status === 'success'
      ? '✅'
      : result?.status === 'error'
        ? '❌'
        : result?.status === 'pending'
          ? '⏳'
          : '';

  return (
    <div className={`border rounded p-3 transition ${statusColor}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-start gap-2">
            <span className="text-lg">{statusIcon}</span>
            <div>
              <div className="font-semibold">{test.name}</div>
              {test.description && (
                <div className="text-sm text-gray-600">{test.description}</div>
              )}
              {result && result.message && (
                <div className="text-sm mt-1">{result.message}</div>
              )}
              {result?.detail && (
                <details className="text-xs mt-1">
                  <summary className="cursor-pointer text-gray-600">
                    See details
                  </summary>
                  <pre className="mt-1 bg-white border rounded p-2 overflow-auto max-h-48">
                    {JSON.stringify(result.detail, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>
        <button
          className="shrink-0 text-xs border rounded px-3 py-1 bg-white hover:bg-gray-50"
          onClick={onRun}
        >
          {result?.status === 'pending' ? 'Running...' : 'Run'}
        </button>
      </div>
    </div>
  );
}

function App({ app }: { app: AppSummary }) {
  const { groups } = useEditableSystemAttrTests(app);
  const [results, setResults] = useState<Record<string, TestRunResult>>({});

  const runTest = useCallback(async (test: PlayTest) => {
    setResults((prev) => ({
      ...prev,
      [test.id]: { status: 'pending', message: 'Running...' },
    }));
    try {
      const outcome = await test.run();
      if (test.shouldFail) {
        setResults((prev) => ({
          ...prev,
          [test.id]: {
            status: 'error',
            message: 'Expected test to throw but it completed successfully',
            detail: outcome,
          },
        }));
        return;
      }
      setResults((prev) => ({
        ...prev,
        [test.id]: {
          status: 'success',
          message: outcome?.message || 'Succeeded',
          detail: outcome?.detail,
        },
      }));
    } catch (err: any) {
      if (test.shouldFail) {
        setResults((prev) => ({
          ...prev,
          [test.id]: {
            status: 'success',
            message: `Failed as expected: ${toErrorMessage(err)}`,
            detail: err?.body || { error: toErrorMessage(err) },
          },
        }));
      } else {
        setResults((prev) => ({
          ...prev,
          [test.id]: {
            status: 'error',
            message: toErrorMessage(err),
            detail: err?.body || { error: toErrorMessage(err) },
          },
        }));
      }
    }
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Editable System Attributes</h1>
        <p className="text-sm text-gray-600">
          Use these examples to exercise system namespace behaviors. Each test
          is self-contained—click the buttons to verify that custom attributes
          can be added and updated, while protected system fields remain
          guarded.
        </p>
      </header>
      {groups.map((group) => (
        <section key={group.title} className="space-y-3">
          <h2 className="text-xl font-semibold">{group.title}</h2>
          <div className="space-y-3">
            {group.tests.map((test) => (
              <TestCard
                key={test.id}
                test={test}
                result={results[test.id]}
                onRun={() => runTest(test)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function Page() {
  const [app, setApp] = useState<AppSummary | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    provisionEphemeralApp({
      perms: {
        $users: {
          allow: {
            view: 'auth.id == data.id',
            update: 'auth.id == data.id',
          },
        },
        $files: {
          allow: {
            view: 'auth.id != null',
            update: 'auth.id != null',
            create: 'auth.id != null',
          },
        },
      },
    })
      .then((res) => setApp(res.app))
      .catch((e) => {
        console.error('Error creating app', e);
        setError(e);
      });
  }, []);

  if (error) {
    return (
      <div className="max-w-3xl mx-auto mt-8">
        There was an error: {error.message}
      </div>
    );
  }

  if (!app) {
    return <div className="max-w-3xl mx-auto mt-8">Loading...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto mt-8">
      <App app={app} />
    </div>
  );
}
