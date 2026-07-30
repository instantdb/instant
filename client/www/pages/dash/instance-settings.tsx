import {
  MainDashLayout,
  useFetchedDash,
} from '@/components/dash/MainDashLayout';
import { BackToAppsButton } from '@/components/dash/BackToAppsButton';
import { ClientOnly } from '@/components/clientOnlyPage';
import { Button, FullscreenLoading, Select, TextInput } from '@/components/ui';
import config from '@/lib/config';
import { errorToast, successToast } from '@/lib/toast';
import { InstantApp } from '@/lib/types';
import { id, init } from '@instantdb/react';
import Head from 'next/head';
import { useEffect, useState } from 'react';
import { NextPageWithLayout } from '../_app';

type SignupMode = 'open' | 'restricted' | 'closed';

type SignupSettings = {
  id: string;
  mode: SignupMode;
  name: string;
};

type AllowedEmail = {
  id: string;
  email: string;
};

const dashboardSignupSettingsId = 'fde92a9e-d803-4718-9266-02d8d7a4fdff';

const signupModeOptions: {
  label: string;
  value: SignupMode;
  description: string;
}[] = [
  {
    label: 'Open',
    value: 'open',
    description: 'Anyone can create an Instant dashboard account.',
  },
  {
    label: 'Restricted',
    value: 'restricted',
    description: 'Only the email addresses listed below can create an account.',
  },
  {
    label: 'Closed',
    value: 'closed',
    description: 'No new dashboard accounts can be created.',
  },
];

function InstantConfigSettings({ app }: { app: InstantApp }) {
  const [db] = useState(() =>
    init({
      appId: app.id,
      apiURI: config.apiURI,
      websocketURI: config.websocketURI,
      // @ts-expect-error Instant's dashboard uses the app admin token.
      __adminToken: app.admin_token,
      disableValidation: true,
    }),
  );
  const [newEmail, setNewEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const { data, error, isLoading } = db.useQuery({
    'dashboard-allowed-emails': {},
    'dashboard-signup-settings': {
      $: { where: { id: dashboardSignupSettingsId } },
    },
  });

  useEffect(() => {
    return () => db.core.shutdown();
  }, [db]);

  if (isLoading) {
    return <FullscreenLoading />;
  }

  if (error) {
    return (
      <div className="rounded-sm border border-red-300 bg-red-50 p-4 text-sm text-red-700">
        Could not load instance settings: {error.message}
      </div>
    );
  }

  const settings = data?.['dashboard-signup-settings']?.[0] as
    | SignupSettings
    | undefined;
  const mode = settings?.mode ?? 'open';
  const allowedEmails = [
    ...((data?.['dashboard-allowed-emails'] as AllowedEmail[] | undefined) ??
      []),
  ].sort((a, b) => a.email.localeCompare(b.email));
  const selectedMode = signupModeOptions.find(
    (option) => option.value === mode,
  );

  const updateMode = async (nextMode: SignupMode) => {
    setSaving(true);
    try {
      await db.transact(
        db.tx['dashboard-signup-settings'][dashboardSignupSettingsId].update({
          mode: nextMode,
          name: 'default',
        }),
      );
      successToast('Signup settings updated.');
    } catch {
      errorToast('Could not update signup settings.');
    } finally {
      setSaving(false);
    }
  };

  const addEmail = async () => {
    const normalizedEmail = newEmail.trim().toLowerCase();
    if (
      !normalizedEmail ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    ) {
      errorToast('Enter a valid email address.');
      return;
    }

    setSaving(true);
    try {
      await db.transact(
        db.tx['dashboard-allowed-emails'][id()].update({
          email: normalizedEmail,
        }),
      );
      setNewEmail('');
      successToast(`${normalizedEmail} can now sign up.`);
    } catch {
      errorToast('Could not add this email address.');
    } finally {
      setSaving(false);
    }
  };

  const removeEmail = async (allowedEmail: AllowedEmail) => {
    setSaving(true);
    try {
      await db.transact(
        db.tx['dashboard-allowed-emails'][allowedEmail.id].delete(),
      );
      successToast(`${allowedEmail.email} removed.`);
    } catch {
      errorToast('Could not remove this email address.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-sm border border-gray-300 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-800">
        <div className="mb-4">
          <h2 className="font-semibold">Dashboard signups</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-neutral-400">
            Existing users can always sign in. These settings only apply when
            someone creates a new dashboard account.
          </p>
        </div>
        <label className="block text-sm font-medium">Who can sign up?</label>
        <Select
          className="mt-2 w-full md:w-72"
          disabled={saving}
          value={mode}
          options={signupModeOptions.map(({ label, value }) => ({
            label,
            value,
          }))}
          onChange={(option) => {
            if (option) {
              void updateMode(option.value);
            }
          }}
        />
        <p className="mt-2 text-sm text-gray-600 dark:text-neutral-400">
          {selectedMode?.description}
        </p>
        {mode === 'restricted' && (
          <div className="mt-5 border-t border-gray-200 pt-5 dark:border-neutral-700">
            <h3 className="font-medium">Allowed email addresses</h3>
            <form
              className="mt-3 flex max-w-xl gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void addEmail();
              }}
            >
              <TextInput
                className="grow"
                type="email"
                placeholder="person@example.com"
                value={newEmail}
                onChange={setNewEmail}
              />
              <Button type="submit" disabled={saving || !newEmail.trim()}>
                Add
              </Button>
            </form>
            <div className="mt-4 divide-y divide-gray-200 rounded-sm border border-gray-200 dark:divide-neutral-700 dark:border-neutral-700">
              {allowedEmails.length ? (
                allowedEmails.map((allowedEmail) => (
                  <div
                    key={allowedEmail.id}
                    className="flex items-center justify-between gap-4 px-3 py-2"
                  >
                    <span className="truncate text-sm">
                      {allowedEmail.email}
                    </span>
                    <Button
                      variant="subtle"
                      size="mini"
                      disabled={saving}
                      onClick={() => void removeEmail(allowedEmail)}
                    >
                      Remove
                    </Button>
                  </div>
                ))
              ) : (
                <div className="px-3 py-4 text-sm text-gray-500">
                  No email addresses have been added.
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="flex items-center justify-between gap-4 rounded-sm border border-gray-300 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-800">
        <div>
          <h2 className="font-semibold">Advanced configuration</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-neutral-400">
            Open Instant Config to manage feature flags and other instance
            configuration.
          </p>
        </div>
        <Button
          type="link"
          variant="secondary"
          href={`/dash?app=${app.id}&t=explorer&s=main`}
        >
          Open Instant Config
        </Button>
      </section>
    </div>
  );
}

const InstanceSettingsPage: NextPageWithLayout = () => {
  const dashResponse = useFetchedDash();
  const configApp = dashResponse.data.apps.find(
    (app) => app.id === dashResponse.data.instant_config_app_id,
  );

  if (!dashResponse.data.superuser) {
    return (
      <>
        <BackToAppsButton />
        <div className="mx-auto w-full px-8 pt-8 md:max-w-4xl">
          <h1 className="text-lg font-semibold">Instance Settings</h1>
          <p className="mt-2 text-sm text-gray-600">
            Only the instance superuser can manage these settings.
          </p>
        </div>
      </>
    );
  }

  if (!configApp) {
    return (
      <>
        <BackToAppsButton />
        <div className="mx-auto w-full px-8 pt-8 md:max-w-4xl">
          <h1 className="text-lg font-semibold">Instance Settings</h1>
          <p className="mt-2 text-sm text-red-600">
            Instant Config is not available for this account.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <BackToAppsButton />
      <main className="mx-auto w-full overflow-y-auto px-8 py-8 md:max-w-4xl">
        <div className="mb-6">
          <h1 className="text-lg font-semibold">Instance Settings</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-neutral-400">
            Manage access and configuration for this Instant instance.
          </p>
        </div>
        <InstantConfigSettings key={configApp.id} app={configApp} />
      </main>
    </>
  );
};

InstanceSettingsPage.getLayout = (page) => (
  <ClientOnly>
    <Head>
      <title>Instance Settings</title>
    </Head>
    <MainDashLayout className="bg-gray-100">{page}</MainDashLayout>
  </ClientOnly>
);

export default InstanceSettingsPage;
