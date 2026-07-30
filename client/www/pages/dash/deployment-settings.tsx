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
import { ReactNode, useEffect, useState } from 'react';
import { validate as isUuid } from 'uuid';
import { NextPageWithLayout } from '../_app';

type SignupMode = 'open' | 'restricted' | 'closed';

type ConfigFlag = {
  id: string;
  setting: string;
  value?: unknown;
};

const flagSettings = {
  dashboardSignups: {
    id: 'fde92a9e-d803-4718-9266-02d8d7a4fdff',
    setting: 'dashboard-signups',
    description:
      'Controls who can create dashboard accounts for this Instant deployment.',
  },
  magicCodeRateLimit: {
    setting: 'magic-code-rate-limit-per-hour',
    description:
      'Maximum magic-code requests per email address and app each hour.',
  },
  magicCodeExpiry: {
    setting: 'default-magic-code-expiry-minutes',
    description: 'Default lifetime of app magic codes in minutes.',
  },
  webhookPrivateIps: {
    setting: 'smokescreen-whitelist-ips',
    description:
      'Private IP addresses that webhook requests may connect to directly.',
  },
  refreshThrottledApps: {
    setting: 'refresh-throttled-apps',
    description: 'App IDs whose realtime refreshes should be throttled.',
  },
  refreshThrottleMs: {
    setting: 'refresh-throttle-ms',
    description: 'Delay between throttled realtime refreshes in milliseconds.',
  },
} as const;

const defaults = {
  magicCodeRateLimit: 20,
  magicCodeExpiry: 1440,
  refreshThrottleMs: 1000,
};

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stringListValue(value: unknown) {
  return [
    ...new Set(
      Array.isArray(value)
        ? value
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim().toLowerCase())
            .filter(Boolean)
        : [],
    ),
  ].sort((a, b) => a.localeCompare(b));
}

function parseInteger(value: string, minimum: number) {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    return undefined;
  }
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed >= minimum ? parsed : undefined;
}

function isLiteralIpAddress(value: string) {
  const ipv4Parts = value.split('.');
  if (
    ipv4Parts.length === 4 &&
    ipv4Parts.every(
      (part) =>
        /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255,
    )
  ) {
    return true;
  }

  if (!value.includes(':')) {
    return false;
  }

  try {
    new URL(`http://[${value}]/`);
    return true;
  } catch {
    return false;
  }
}

function SettingsCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-sm border border-gray-300 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-800">
      <div className="mb-4">
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-neutral-400">
          {description}
        </p>
      </div>
      {children}
    </section>
  );
}

function StringListEditor({
  items,
  value,
  placeholder,
  emptyMessage,
  disabled,
  onChange,
  onAdd,
  onRemove,
}: {
  items: string[];
  value: string;
  placeholder: string;
  emptyMessage: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onAdd: () => void;
  onRemove: (value: string) => void;
}) {
  return (
    <>
      <form
        className="flex max-w-xl gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onAdd();
        }}
      >
        <TextInput
          className="grow"
          placeholder={placeholder}
          value={value}
          onChange={onChange}
        />
        <Button type="submit" disabled={disabled || !value.trim()}>
          Add
        </Button>
      </form>
      <div className="mt-4 divide-y divide-gray-200 rounded-sm border border-gray-200 dark:divide-neutral-700 dark:border-neutral-700">
        {items.length ? (
          items.map((item) => (
            <div
              key={item}
              className="flex items-center justify-between gap-4 px-3 py-2"
            >
              <span className="truncate font-mono text-xs">{item}</span>
              <Button
                variant="subtle"
                size="mini"
                disabled={disabled}
                onClick={() => onRemove(item)}
              >
                Remove
              </Button>
            </div>
          ))
        ) : (
          <div className="px-3 py-4 text-sm text-gray-500">{emptyMessage}</div>
        )}
      </div>
    </>
  );
}

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
  const [magicCodeRateLimitInput, setMagicCodeRateLimitInput] = useState(
    String(defaults.magicCodeRateLimit),
  );
  const [magicCodeExpiryInput, setMagicCodeExpiryInput] = useState(
    String(defaults.magicCodeExpiry),
  );
  const [newWebhookIp, setNewWebhookIp] = useState('');
  const [newThrottledAppId, setNewThrottledAppId] = useState('');
  const [refreshThrottleInput, setRefreshThrottleInput] = useState(
    String(defaults.refreshThrottleMs),
  );
  const [saving, setSaving] = useState(false);
  const { data, error, isLoading } = db.useQuery({ flags: {} });

  const configFlags = (data?.flags ?? []) as ConfigFlag[];
  const flagBySetting = new Map(
    configFlags.map((flag) => [flag.setting, flag]),
  );
  const dashboardSignupsFlag = flagBySetting.get(
    flagSettings.dashboardSignups.setting,
  );
  const dashboardSignupsValue = isRecord(dashboardSignupsFlag?.value)
    ? dashboardSignupsFlag.value
    : {};
  const storedMode = dashboardSignupsValue.mode;
  const mode = signupModeOptions.some((option) => option.value === storedMode)
    ? (storedMode as SignupMode)
    : 'open';
  const allowedEmails = stringListValue(dashboardSignupsValue.allowedEmails);
  const magicCodeRateLimit = numberValue(
    flagBySetting.get(flagSettings.magicCodeRateLimit.setting)?.value,
    defaults.magicCodeRateLimit,
  );
  const magicCodeExpiry = numberValue(
    flagBySetting.get(flagSettings.magicCodeExpiry.setting)?.value,
    defaults.magicCodeExpiry,
  );
  const webhookPrivateIps = stringListValue(
    flagBySetting.get(flagSettings.webhookPrivateIps.setting)?.value,
  );
  const refreshThrottledApps = stringListValue(
    flagBySetting.get(flagSettings.refreshThrottledApps.setting)?.value,
  );
  const refreshThrottleMs = numberValue(
    flagBySetting.get(flagSettings.refreshThrottleMs.setting)?.value,
    defaults.refreshThrottleMs,
  );
  const selectedMode = signupModeOptions.find(
    (option) => option.value === mode,
  );

  useEffect(() => {
    return () => db.core.shutdown();
  }, [db]);

  useEffect(() => {
    setMagicCodeRateLimitInput(String(magicCodeRateLimit));
  }, [magicCodeRateLimit]);

  useEffect(() => {
    setMagicCodeExpiryInput(String(magicCodeExpiry));
  }, [magicCodeExpiry]);

  useEffect(() => {
    setRefreshThrottleInput(String(refreshThrottleMs));
  }, [refreshThrottleMs]);

  if (isLoading) {
    return <FullscreenLoading />;
  }

  if (error) {
    return (
      <div className="rounded-sm border border-red-300 bg-red-50 p-4 text-sm text-red-700">
        Could not load deployment settings: {error.message}
      </div>
    );
  }

  const flagUpdate = (
    definition: {
      id?: string;
      setting: string;
      description: string;
    },
    value: unknown,
  ) => {
    const storedFlag = flagBySetting.get(definition.setting);
    return db.tx.flags[storedFlag?.id ?? definition.id ?? id()].update({
      setting: definition.setting,
      description: definition.description,
      value,
    });
  };

  const saveSignupSettings = (
    nextMode: SignupMode,
    nextAllowedEmails: string[],
  ) => {
    return db.transact(
      flagUpdate(flagSettings.dashboardSignups, {
        mode: nextMode,
        allowedEmails: nextAllowedEmails,
      }),
    );
  };

  const saveAuthenticationSettings = async () => {
    const nextRateLimit = parseInteger(magicCodeRateLimitInput, 0);
    if (nextRateLimit === undefined) {
      errorToast('Magic-code requests must be a non-negative integer.');
      return;
    }

    const nextExpiry = parseInteger(magicCodeExpiryInput, 1);
    if (nextExpiry === undefined) {
      errorToast('Magic-code expiration must be a positive integer.');
      return;
    }

    setSaving(true);
    try {
      await db.transact([
        flagUpdate(flagSettings.magicCodeRateLimit, nextRateLimit),
        flagUpdate(flagSettings.magicCodeExpiry, nextExpiry),
      ]);
      successToast('App authentication settings updated.');
    } catch {
      errorToast('Could not update app authentication settings.');
    } finally {
      setSaving(false);
    }
  };

  const addWebhookIp = async () => {
    const normalizedIp = newWebhookIp.trim().toLowerCase();
    if (!isLiteralIpAddress(normalizedIp)) {
      errorToast('Enter a valid IPv4 or IPv6 address.');
      return;
    }
    if (webhookPrivateIps.includes(normalizedIp)) {
      errorToast('This IP address is already allowed.');
      return;
    }

    setSaving(true);
    try {
      await db.transact(
        flagUpdate(
          flagSettings.webhookPrivateIps,
          [...webhookPrivateIps, normalizedIp].sort(),
        ),
      );
      setNewWebhookIp('');
      successToast(`${normalizedIp} can now receive webhook requests.`);
    } catch {
      errorToast('Could not add this IP address.');
    } finally {
      setSaving(false);
    }
  };

  const removeWebhookIp = async (ipAddress: string) => {
    setSaving(true);
    try {
      await db.transact(
        flagUpdate(
          flagSettings.webhookPrivateIps,
          webhookPrivateIps.filter((ip) => ip !== ipAddress),
        ),
      );
      successToast(`${ipAddress} removed.`);
    } catch {
      errorToast('Could not remove this IP address.');
    } finally {
      setSaving(false);
    }
  };

  const addThrottledApp = async () => {
    const normalizedAppId = newThrottledAppId.trim().toLowerCase();
    if (!isUuid(normalizedAppId)) {
      errorToast('Enter a valid app ID.');
      return;
    }
    if (refreshThrottledApps.includes(normalizedAppId)) {
      errorToast('This app is already throttled.');
      return;
    }

    setSaving(true);
    try {
      await db.transact(
        flagUpdate(
          flagSettings.refreshThrottledApps,
          [...refreshThrottledApps, normalizedAppId].sort(),
        ),
      );
      setNewThrottledAppId('');
      successToast(`${normalizedAppId} is now throttled.`);
    } catch {
      errorToast('Could not add this app.');
    } finally {
      setSaving(false);
    }
  };

  const removeThrottledApp = async (appId: string) => {
    setSaving(true);
    try {
      await db.transact(
        flagUpdate(
          flagSettings.refreshThrottledApps,
          refreshThrottledApps.filter(
            (throttledAppId) => throttledAppId !== appId,
          ),
        ),
      );
      successToast(`${appId} removed.`);
    } catch {
      errorToast('Could not remove this app.');
    } finally {
      setSaving(false);
    }
  };

  const saveRefreshThrottle = async () => {
    const nextThrottleMs = parseInteger(refreshThrottleInput, 0);
    if (nextThrottleMs === undefined) {
      errorToast('The refresh interval must be a non-negative integer.');
      return;
    }

    setSaving(true);
    try {
      await db.transact(
        flagUpdate(flagSettings.refreshThrottleMs, nextThrottleMs),
      );
      successToast('Refresh throttle updated.');
    } catch {
      errorToast('Could not update the refresh throttle.');
    } finally {
      setSaving(false);
    }
  };

  const updateMode = async (nextMode: SignupMode) => {
    setSaving(true);
    try {
      await saveSignupSettings(nextMode, allowedEmails);
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
    if (allowedEmails.includes(normalizedEmail)) {
      errorToast('This email address is already allowed.');
      return;
    }

    setSaving(true);
    try {
      await saveSignupSettings(
        mode,
        [...allowedEmails, normalizedEmail].sort(),
      );
      setNewEmail('');
      successToast(`${normalizedEmail} can now sign up.`);
    } catch {
      errorToast('Could not add this email address.');
    } finally {
      setSaving(false);
    }
  };

  const removeEmail = async (allowedEmail: string) => {
    setSaving(true);
    try {
      await saveSignupSettings(
        mode,
        allowedEmails.filter((email) => email !== allowedEmail),
      );
      successToast(`${allowedEmail} removed.`);
    } catch {
      errorToast('Could not remove this email address.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <SettingsCard
        title="Dashboard access"
        description="Control who can create dashboard accounts. Existing users can always sign in."
      >
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
            <div className="mt-3">
              <StringListEditor
                items={allowedEmails}
                value={newEmail}
                placeholder="person@example.com"
                emptyMessage="No email addresses have been added."
                disabled={saving}
                onChange={setNewEmail}
                onAdd={() => void addEmail()}
                onRemove={(email) => void removeEmail(email)}
              />
            </div>
          </div>
        )}
      </SettingsCard>

      <SettingsCard
        title="App authentication"
        description="Set defaults for magic-code authentication in every app."
      >
        <form
          className="grid gap-5 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            void saveAuthenticationSettings();
          }}
        >
          <div>
            <TextInput
              label="Requests per hour"
              inputMode="numeric"
              value={magicCodeRateLimitInput}
              disabled={saving}
              onChange={setMagicCodeRateLimitInput}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-neutral-400">
              Per email address in each app. Set to 0 to disable magic-code
              authentication.
            </p>
          </div>
          <div>
            <TextInput
              label="Code expiration (minutes)"
              inputMode="numeric"
              value={magicCodeExpiryInput}
              disabled={saving}
              onChange={setMagicCodeExpiryInput}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-neutral-400">
              Apps use this value unless they configure their own expiration.
            </p>
          </div>
          <div className="md:col-span-2">
            <Button type="submit" disabled={saving}>
              Save authentication settings
            </Button>
          </div>
        </form>
      </SettingsCard>

      <SettingsCard
        title="Webhook networking"
        description="Allow webhook requests to reach selected private or internal IP addresses."
      >
        <p className="mb-4 text-sm text-gray-600 dark:text-neutral-400">
          Private destinations are blocked by default to protect against
          server-side request forgery. Add only addresses you trust.
        </p>
        <StringListEditor
          items={webhookPrivateIps}
          value={newWebhookIp}
          placeholder="10.0.0.25"
          emptyMessage="No private IP addresses are allowed."
          disabled={saving}
          onChange={setNewWebhookIp}
          onAdd={() => void addWebhookIp()}
          onRemove={(ipAddress) => void removeWebhookIp(ipAddress)}
        />
      </SettingsCard>

      <SettingsCard
        title="Realtime performance"
        description="Throttle realtime refreshes for selected apps to reduce burst load."
      >
        <form
          className="flex max-w-xl items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void saveRefreshThrottle();
          }}
        >
          <TextInput
            className="grow"
            label="Throttle interval (milliseconds)"
            inputMode="numeric"
            value={refreshThrottleInput}
            disabled={saving}
            onChange={setRefreshThrottleInput}
          />
          <Button type="submit" disabled={saving}>
            Save interval
          </Button>
        </form>
        <div className="mt-5 border-t border-gray-200 pt-5 dark:border-neutral-700">
          <h3 className="font-medium">Throttled app IDs</h3>
          <p className="mt-1 mb-3 text-sm text-gray-600 dark:text-neutral-400">
            Find an app ID in its dashboard URL. Throttling increases realtime
            latency.
          </p>
          <StringListEditor
            items={refreshThrottledApps}
            value={newThrottledAppId}
            placeholder="00000000-0000-0000-0000-000000000000"
            emptyMessage="No apps are throttled."
            disabled={saving}
            onChange={setNewThrottledAppId}
            onAdd={() => void addThrottledApp()}
            onRemove={(appId) => void removeThrottledApp(appId)}
          />
        </div>
      </SettingsCard>

      <section className="flex items-center justify-between gap-4 rounded-sm border border-gray-300 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-800">
        <div>
          <h2 className="font-semibold">Advanced settings</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-neutral-400">
            Open Instant Config to edit every flag and toggle directly.
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

const DeploymentSettingsPage: NextPageWithLayout = () => {
  const dashResponse = useFetchedDash();
  const configApp = dashResponse.data.apps.find(
    (app) => app.id === dashResponse.data.instant_config_app_id,
  );

  if (!dashResponse.data.superuser) {
    return (
      <>
        <BackToAppsButton />
        <div className="mx-auto w-full px-8 pt-8 md:max-w-4xl">
          <h1 className="text-lg font-semibold">Deployment Settings</h1>
          <p className="mt-2 text-sm text-gray-600">
            Only the superuser can manage these deployment settings.
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
          <h1 className="text-lg font-semibold">Deployment Settings</h1>
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
          <h1 className="text-lg font-semibold">Deployment Settings</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-neutral-400">
            Manage access and configuration for this self-hosted deployment.
          </p>
        </div>
        <InstantConfigSettings key={configApp.id} app={configApp} />
      </main>
    </>
  );
};

DeploymentSettingsPage.getLayout = (page) => (
  <ClientOnly>
    <Head>
      <title>Deployment Settings</title>
    </Head>
    <MainDashLayout className="bg-gray-100">{page}</MainDashLayout>
  </ClientOnly>
);

export default DeploymentSettingsPage;
