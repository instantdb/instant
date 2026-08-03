import { Button, FullscreenLoading, Select, TextInput } from '@/components/ui';
import { useAuthToken } from '@/lib/auth';
import config from '@/lib/config';
import { TokenContext } from '@/lib/contexts';
import { useDashFetch } from '@/lib/hooks/useDashFetch';
import { useIsHydrated } from '@/lib/hooks/useIsHydrated';
import { errorToast, successToast } from '@/lib/toast';
import { InstantApp } from '@/lib/types';
import { ChevronRightIcon, TrashIcon } from '@heroicons/react/24/outline';
import { id, init } from '@instantdb/react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ReactNode, useEffect, useState } from 'react';
import { validate as isUuid } from 'uuid';

type SignupMode = 'open' | 'restricted' | 'closed';

type ConfigFlag = {
  id: string;
  setting: string;
  value?: unknown;
};

type InstantConfigDb = ReturnType<typeof init>;

const flagSettings = {
  dashboardSignups: {
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

// Keep these in sync with the fallback values in server/src/instant/flags.clj.
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

function integerValue(value: unknown, fallback: number, minimum: number) {
  return typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= minimum
    ? value
    : fallback;
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

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold">{title}</h2>
        <p className="text-sm text-gray-500 dark:text-neutral-400">
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
  inputClassName,
  placeholder,
  emptyMessage,
  disabled,
  onChange,
  onAdd,
  onRemove,
}: {
  items: string[];
  value: string;
  inputClassName: string;
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
        className="flex w-full items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onAdd();
        }}
      >
        <div className={inputClassName}>
          <TextInput
            placeholder={placeholder}
            value={value}
            onChange={onChange}
          />
        </div>
        <Button
          type="submit"
          variant="secondary"
          disabled={disabled || !value.trim()}
        >
          Add
        </Button>
      </form>
      <div className="mt-3 divide-y divide-gray-200 overflow-hidden rounded-sm border border-gray-200 bg-white dark:divide-neutral-700 dark:border-neutral-700 dark:bg-neutral-800">
        {items.length ? (
          items.map((item) => (
            <div
              key={item}
              className="flex items-center justify-between gap-4 px-3 py-2"
            >
              <span className="truncate font-mono text-xs">{item}</span>
              <button
                type="button"
                aria-label={`Remove ${item}`}
                title={`Remove ${item}`}
                disabled={disabled}
                className="cursor-pointer text-gray-400 hover:text-red-500 disabled:cursor-default disabled:text-gray-300 dark:text-neutral-500 dark:hover:text-red-400 dark:disabled:text-neutral-700"
                onClick={() => onRemove(item)}
              >
                <TrashIcon className="size-4" />
              </button>
            </div>
          ))
        ) : (
          <div className="px-3 py-3 text-sm text-gray-500">{emptyMessage}</div>
        )}
      </div>
    </>
  );
}

function NumericSettingField({
  label,
  value,
  unit,
  inputClassName,
  helper,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  unit: string;
  inputClassName: string;
  helper?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <div className="flex items-end gap-2">
        <TextInput
          className={inputClassName}
          label={label}
          inputMode="numeric"
          value={value}
          disabled={disabled}
          onChange={onChange}
        />
        <span className="pb-1 text-sm text-gray-500 dark:text-neutral-400">
          {unit}
        </span>
      </div>
      {helper ? (
        <p className="mt-1 text-xs text-gray-500 dark:text-neutral-400">
          {helper}
        </p>
      ) : null}
    </div>
  );
}

function InstantConfigSettingsContent({
  app,
  db,
}: {
  app: InstantApp;
  db: InstantConfigDb;
}) {
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
  const [authenticationEditing, setAuthenticationEditing] = useState(false);
  const [refreshThrottleEditing, setRefreshThrottleEditing] = useState(false);
  const [authenticationSaved, setAuthenticationSaved] = useState(false);
  const [refreshThrottleSaved, setRefreshThrottleSaved] = useState(false);
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
  const magicCodeRateLimit = integerValue(
    flagBySetting.get(flagSettings.magicCodeRateLimit.setting)?.value,
    defaults.magicCodeRateLimit,
    1,
  );
  const magicCodeExpiry = integerValue(
    flagBySetting.get(flagSettings.magicCodeExpiry.setting)?.value,
    defaults.magicCodeExpiry,
    1,
  );
  const webhookPrivateIps = stringListValue(
    flagBySetting.get(flagSettings.webhookPrivateIps.setting)?.value,
  );
  const refreshThrottledApps = stringListValue(
    flagBySetting.get(flagSettings.refreshThrottledApps.setting)?.value,
  );
  const refreshThrottleMs = integerValue(
    flagBySetting.get(flagSettings.refreshThrottleMs.setting)?.value,
    defaults.refreshThrottleMs,
    0,
  );
  const selectedMode = signupModeOptions.find(
    (option) => option.value === mode,
  );
  const authenticationDirty =
    magicCodeRateLimitInput !== String(magicCodeRateLimit) ||
    magicCodeExpiryInput !== String(magicCodeExpiry);
  const refreshThrottleDirty =
    refreshThrottleInput !== String(refreshThrottleMs);

  useEffect(() => {
    if (!authenticationEditing) {
      setMagicCodeRateLimitInput(String(magicCodeRateLimit));
    }
  }, [authenticationEditing, magicCodeRateLimit]);

  useEffect(() => {
    if (!authenticationEditing) {
      setMagicCodeExpiryInput(String(magicCodeExpiry));
    }
  }, [authenticationEditing, magicCodeExpiry]);

  useEffect(() => {
    if (!refreshThrottleEditing) {
      setRefreshThrottleInput(String(refreshThrottleMs));
    }
  }, [refreshThrottleEditing, refreshThrottleMs]);

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
      setting: string;
      description: string;
    },
    value: unknown,
  ) => {
    const storedFlag = flagBySetting.get(definition.setting);
    return db.tx.flags[storedFlag?.id ?? id()].update({
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
    const nextRateLimit = parseInteger(magicCodeRateLimitInput, 1);
    if (nextRateLimit === undefined) {
      errorToast('Magic-code requests must be a positive integer.');
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
      setAuthenticationEditing(false);
      setAuthenticationSaved(true);
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
      setRefreshThrottleEditing(false);
      setRefreshThrottleSaved(true);
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
    <div className="flex flex-col gap-6">
      <SettingsSection
        title="Dashboard access"
        description="Control who can create dashboard accounts. Existing users can always sign in."
      >
        <div>
          <label className="block text-sm font-medium">Who can sign up?</label>
          <Select
            className="mt-1.5 w-full md:w-72"
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
          <p className="mt-1.5 text-sm text-gray-500 dark:text-neutral-400">
            {selectedMode?.description}
          </p>
        </div>
        {mode === 'restricted' && (
          <div className="border-t border-gray-200 pt-4 dark:border-neutral-700">
            <h3 className="mb-2 text-sm font-medium">
              Allowed email addresses
            </h3>
            <div>
              <StringListEditor
                items={allowedEmails}
                value={newEmail}
                inputClassName="min-w-0 flex-1 sm:w-[26rem] sm:flex-none"
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
      </SettingsSection>

      <SettingsSection
        title="App authentication"
        description="Set magic-code defaults across every app in this deployment."
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void saveAuthenticationSettings();
          }}
        >
          <div className="flex flex-wrap gap-x-8 gap-y-4">
            <NumericSettingField
              label="Requests per email per hour"
              value={magicCodeRateLimitInput}
              unit="requests per hour"
              inputClassName="w-28"
              disabled={saving}
              onChange={(value) => {
                setMagicCodeRateLimitInput(value);
                setAuthenticationEditing(
                  value !== String(magicCodeRateLimit) ||
                    magicCodeExpiryInput !== String(magicCodeExpiry),
                );
                setAuthenticationSaved(false);
              }}
            />
            <NumericSettingField
              label="Code expires after"
              value={magicCodeExpiryInput}
              unit="minutes"
              inputClassName="w-36"
              helper="Apps use this value unless they configure their own expiration."
              disabled={saving}
              onChange={(value) => {
                setMagicCodeExpiryInput(value);
                setAuthenticationEditing(
                  magicCodeRateLimitInput !== String(magicCodeRateLimit) ||
                    value !== String(magicCodeExpiry),
                );
                setAuthenticationSaved(false);
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="submit"
              variant={authenticationDirty ? 'primary' : 'secondary'}
              disabled={saving || !authenticationDirty}
            >
              Save authentication settings
            </Button>
            {authenticationSaved && !authenticationDirty ? (
              <span className="text-xs text-gray-500 dark:text-neutral-400">
                Saved
              </span>
            ) : null}
          </div>
        </form>
      </SettingsSection>

      <SettingsSection
        title="Private webhook destinations"
        description="Allow trusted private or internal IP addresses for webhook destinations. Private destinations stay blocked by default."
      >
        <StringListEditor
          items={webhookPrivateIps}
          value={newWebhookIp}
          inputClassName="min-w-0 flex-1 sm:w-60 sm:flex-none"
          placeholder="10.0.0.25"
          emptyMessage="No private IP addresses are allowed."
          disabled={saving}
          onChange={setNewWebhookIp}
          onAdd={() => void addWebhookIp()}
          onRemove={(ipAddress) => void removeWebhookIp(ipAddress)}
        />
      </SettingsSection>

      <SettingsSection
        title="Realtime throttling"
        description="Throttle refreshes for selected apps to reduce burst load. Throttling increases realtime latency."
      >
        <div>
          <h3 className="text-sm font-medium">Throttled app IDs</h3>
          <p className="mt-1 mb-2 text-sm text-gray-500 dark:text-neutral-400">
            Find an app ID in its dashboard URL.
          </p>
          <StringListEditor
            items={refreshThrottledApps}
            value={newThrottledAppId}
            inputClassName="min-w-0 flex-1"
            placeholder="00000000-0000-0000-0000-000000000000"
            emptyMessage="No apps are throttled."
            disabled={saving}
            onChange={setNewThrottledAppId}
            onAdd={() => void addThrottledApp()}
            onRemove={(appId) => void removeThrottledApp(appId)}
          />
        </div>
        <form
          className="flex flex-col gap-3 border-t border-gray-200 pt-4 dark:border-neutral-700"
          onSubmit={(event) => {
            event.preventDefault();
            void saveRefreshThrottle();
          }}
        >
          <NumericSettingField
            label="Throttle interval"
            value={refreshThrottleInput}
            unit="ms"
            inputClassName="w-28"
            disabled={saving}
            onChange={(value) => {
              setRefreshThrottleInput(value);
              setRefreshThrottleEditing(value !== String(refreshThrottleMs));
              setRefreshThrottleSaved(false);
            }}
          />
          <div className="flex items-center gap-2">
            <Button
              type="submit"
              variant={refreshThrottleDirty ? 'primary' : 'secondary'}
              disabled={saving || !refreshThrottleDirty}
            >
              Save interval
            </Button>
            {refreshThrottleSaved && !refreshThrottleDirty ? (
              <span className="text-xs text-gray-500 dark:text-neutral-400">
                Saved
              </span>
            ) : null}
          </div>
        </form>
      </SettingsSection>

      <Link
        href={`/dash?app=${app.id}&t=explorer&s=main`}
        className="flex items-center justify-between gap-3 rounded-sm border border-gray-200 bg-white px-4 py-3 hover:bg-gray-50 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-700"
      >
        <div className="min-w-0">
          <h2 className="text-sm font-medium">Advanced settings</h2>
          <p className="mt-0.5 truncate text-sm text-gray-500 dark:text-neutral-400">
            Open Instant Config to edit every flag and toggle directly.
          </p>
        </div>
        <ChevronRightIcon
          className="size-4 shrink-0 text-gray-300 dark:text-neutral-600"
          aria-hidden="true"
        />
      </Link>
    </div>
  );
}

function InstantConfigSettings({ app }: { app: InstantApp }) {
  const [db, setDb] = useState<InstantConfigDb | null>(null);

  useEffect(() => {
    const db = init({
      appId: app.id,
      apiURI: config.apiURI,
      websocketURI: config.websocketURI,
      // @ts-expect-error Instant's dashboard uses the app admin token.
      __adminToken: app.admin_token,
      disableValidation: true,
    });

    setDb(db);
    return () => db.core.shutdown();
  }, [app.id, app.admin_token]);

  if (!db) {
    return <FullscreenLoading />;
  }

  return <InstantConfigSettingsContent app={app} db={db} />;
}

function DeploymentSettingsContent() {
  const dashResponse = useDashFetch();

  if (!dashResponse.data) {
    if (dashResponse.error) {
      return (
        <p className="text-sm text-red-600">
          Could not load deployment settings: {dashResponse.error.message}
        </p>
      );
    }
    return <FullscreenLoading />;
  }

  const data = dashResponse.data;
  const configApp = data.apps.find(
    (app) => app.id === data.instant_config_app_id,
  );

  if (!data.superuser) {
    return (
      <p className="text-sm text-gray-600">
        Only the superuser can manage these deployment settings.
      </p>
    );
  }

  if (!configApp) {
    return (
      <p className="text-sm text-red-600">
        Instant Config is not available for this account.
      </p>
    );
  }

  return <InstantConfigSettings key={configApp.id} app={configApp} />;
}

function DeploymentSettingsPage() {
  const isHydrated = useIsHydrated();
  const token = useAuthToken();
  const router = useRouter();

  useEffect(() => {
    if (isHydrated && router.isReady && !token) {
      void router.replace('/dash?return-to=/intern/deployment-settings');
    }
  }, [isHydrated, router, token]);

  if (!isHydrated || !router.isReady || !token) {
    return null;
  }

  return (
    <TokenContext.Provider value={token}>
      <Head>
        <title>Deployment Settings</title>
      </Head>
      <div className="min-h-screen bg-gray-100 px-4 py-8">
        <main className="mx-auto w-full max-w-2xl">
          <Link
            href="/dash"
            className="mb-6 inline-block text-sm text-gray-500 hover:text-gray-900"
          >
            Back to dashboard
          </Link>
          <div className="mb-6">
            <h1 className="text-xl font-semibold">Deployment Settings</h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-neutral-400">
              Manage access and configuration for this self-hosted deployment.
            </p>
          </div>
          <DeploymentSettingsContent />
        </main>
      </div>
    </TokenContext.Provider>
  );
}

export default DeploymentSettingsPage;
