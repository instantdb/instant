import { useContext, useState, useEffect } from 'react';
import config from '@/lib/config';
import { jsonMutate, jsonFetch } from '@/lib/fetch';
import { TokenContext } from '@/lib/contexts';
import { InstantApp } from '@/lib/types';
import {
  ActionButton,
  Button,
  CodeEditor,
  Content,
  Dialog,
  Label,
  SubsectionHeading,
  TextInput,
  useDialog,
} from '@/components/ui';
import { displayInstantStandardError, useForm } from '@/lib/hooks/useForm';
import { useFlag } from '@/lib/hooks/useFlag';
import { errorToast, successToast } from '@/lib/toast';
import clsx from 'clsx';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/solid';
import { useFetchedDash } from '../MainDashLayout';
import { useDarkMode } from '../DarkModeToggle';

// Shown when the app hasn't set up a custom sender. Matches the server default
// (config/app-email-sender); env overrides won't change what's actually sent.
const DEFAULT_SENDER_EMAIL = 'verify@auth-pm.instantdb.com';

export type EmailValues = {
  from: string;
  subject: string;
  bodyHtml: string;
  senderEmail: string;
};

export type SenderVerificationInfo = {
  ID: number;
  EmailAddress: string;
  Confirmed: boolean;
  DKIMHost?: string;
  DKIMPendingHost?: string;
  DKIMPendingTextValue?: string;
  DKIMTextValue?: string;
  ReturnPathDomain: string;
  ReturnPathDomainCNAMEValue: string;
};

export function getSenderVerification({
  token,
  appId,
}: {
  token: string;
  appId: string;
}): Promise<{
  senderEmail: string;
  verification: SenderVerificationInfo | null;
}> {
  return jsonFetch(`${config.apiURI}/dash/apps/${appId}/sender-verification`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
  });
}

// Mirror the server's `friendly-expiration` (magic_code_auth.clj).
function expirationLabel(minutes: number | null) {
  const m = minutes ?? 10;
  if (m >= 60) {
    const hours = Math.floor(m / 60);
    return `${hours} hour${hours > 1 ? 's' : ''}`;
  }
  return `${m} minute${m > 1 ? 's' : ''}`;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const DEFAULT_MAGIC_CODE_SUBJECT = '{code} is your code for {app_title}';

// Fill template variables with sample values the same way the server does
// (literal {var} replace). Body values are HTML-escaped; subjects/plain text
// are not. Shared by the editor preview and the auth landing summary.
export function substituteSampleVars(
  template: string,
  app: InstantApp,
  escape = false,
): string {
  const v = (raw: string) => (escape ? escapeHtml(raw) : raw);
  return (template ?? '')
    .replace(/\{code\}/g, v('123456'))
    .replace(/\{app_title\}/g, v(app.title))
    .replace(/\{user_email\}/g, v('happyuser@gmail.com'))
    .replace(
      /\{expiration\}/g,
      v(expirationLabel(app.magic_code_expiry_minutes)),
    );
}

export function Email({ app }: { app: InstantApp }) {
  const dashResponse = useFetchedDash();
  const template = app.magic_code_email_template;
  const token = useContext(TokenContext);
  const [customSender, setCustomSender] = useState(Boolean(template?.email));
  const [showDnsRecords, setShowDnsRecords] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  // The test-email endpoint ships after the frontend; hide the button until then.
  const showSendTest = useFlag('sendTestEmail');
  const [bodyTab, setBodyTab] = useState<'edit' | 'preview'>('edit');
  const [{ isVerifying, verification }, setVerification] = useState<{
    isVerifying: boolean;
    verification: SenderVerificationInfo | null;
  }>({
    isVerifying: false,
    verification: null,
  });

  const { darkMode } = useDarkMode();

  const checkVerification = async () => {
    setVerification((prev) => ({ ...prev, isVerifying: true }));
    try {
      const response = await getSenderVerification({
        token,
        appId: app.id,
      });
      setVerification((prev) => ({
        ...prev,
        verification: response.verification,
      }));
    } catch (error) {
      console.error('Failed to check verification:', error);
      errorToast('Failed to check verification status');
    } finally {
      setVerification((prev) => ({ ...prev, isVerifying: false }));
    }
  };

  async function onSubmit(values: EmailValues) {
    return dashResponse
      .optimisticUpdate(
        jsonMutate<{ id: string }>(
          `${config.apiURI}/dash/apps/${app.id}/email_templates`,
          {
            body: {
              'email-type': 'magic-code',
              subject: values.subject,
              body: values.bodyHtml,
              'sender-email': values.senderEmail,
              'sender-name': values.from,
            },
            token,
          },
        ),
      )
      .then(
        () => {
          successToast('Email template saved!');
          if (values.senderEmail) {
            checkVerification();
          }
        },
        (errorRes) =>
          displayInstantStandardError(errorRes, form, {
            'sender-email': 'senderEmail',
            'sender-name': 'from',
            body: 'bodyHtml',
            subject: 'subject',
          }),
      );
  }

  const form = useForm<EmailValues>({
    onSubmit,
    submitLabel: 'Save changes',
    submittingLabel: 'Saving...',
    validators: {
      subject: validateTemplate,
      bodyHtml: validateTemplate,
    },
    initial: template
      ? {
          subject: template.subject,
          bodyHtml: template.body,
          from: template.name ?? '',
          senderEmail: template.email ?? '',
        }
      : formDefaults,
  });

  useEffect(() => {
    if (template?.email) {
      checkVerification();
    }
  }, []);

  const subjectValue = form.inputProps('subject').value as string;
  const bodyValue = form.inputProps('bodyHtml').value as string;
  const fromValue = form.inputProps('from').value as string;
  const senderEmailValue = form.inputProps('senderEmail').value as string;

  const previewBody = substituteSampleVars(bodyValue, app, true);
  const previewSubject = substituteSampleVars(subjectValue, app);
  const previewFrom = fromValue || app.title;

  const useInstantSender = () => {
    setCustomSender(false);
    form.inputProps('senderEmail').onChange('');
  };

  const handleSendTest = async () => {
    setIsSendingTest(true);
    try {
      const res = await jsonMutate<{ 'sent-to': string }>(
        `${config.apiURI}/dash/apps/${app.id}/send-test-email`,
        {
          token,
          body: {
            to: dashResponse.data.user.email,
            subject: subjectValue,
            body: bodyValue,
            'sender-name': fromValue || undefined,
            'sender-email': senderEmailValue || undefined,
          },
        },
      );
      successToast(`Test email sent to ${res['sent-to'] ?? 'your inbox'}`);
    } catch (e) {
      console.error(e);
      errorToast('Failed to send test email');
    } finally {
      setIsSendingTest(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <form {...form.formProps()} className="flex flex-col gap-6">
        <TextInput
          {...form.inputProps('subject')}
          label="Subject"
          placeholder="Your code for {app_title} is {code}"
        />

        <div className="flex flex-col gap-3">
          <TextInput
            {...form.inputProps('from')}
            label="Sender name"
            placeholder={app.title}
          />

          <div className="flex flex-col gap-1.5">
            <Label>Sender email</Label>
            {customSender ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="grow">
                    <TextInput
                      {...form.inputProps('senderEmail')}
                      placeholder="you@yourdomain.com"
                    />
                  </div>
                  {verification ? (
                    <span
                      className={clsx(
                        'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                        verification.Confirmed
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
                      )}
                    >
                      {verification.Confirmed ? 'Verified' : 'Pending'}
                    </span>
                  ) : null}
                </div>

                {verification ? (
                  <Content className="text-sm text-gray-500 dark:text-neutral-400">
                    {verification.Confirmed
                      ? `${verification.EmailAddress} is verified.`
                      : `Check ${verification.EmailAddress} for a confirmation link, then `}
                    {!verification.Confirmed ? (
                      <button
                        type="button"
                        onClick={checkVerification}
                        className="text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {isVerifying ? 'refreshing…' : 'refresh'}
                      </button>
                    ) : null}
                  </Content>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-neutral-400">
                    Save to email a confirmation link to this address.
                  </p>
                )}

                {verification ? (
                  <div className="overflow-hidden rounded-sm border dark:border-neutral-700">
                    <button
                      type="button"
                      onClick={() => setShowDnsRecords((v) => !v)}
                      className="flex w-full cursor-pointer items-center justify-between px-3 py-2 text-left text-sm"
                    >
                      <span className="text-gray-600 dark:text-neutral-300">
                        DNS records{' '}
                        <span className="text-gray-400 dark:text-neutral-500">
                          (optional, improves deliverability)
                        </span>
                      </span>
                      {showDnsRecords ? (
                        <ChevronUpIcon height={14} className="text-gray-400" />
                      ) : (
                        <ChevronDownIcon
                          height={14}
                          className="text-gray-400"
                        />
                      )}
                    </button>
                    {showDnsRecords ? (
                      <div className="flex flex-col gap-3 border-t p-3 dark:border-neutral-700">
                        <DnsRecord
                          label="DKIM"
                          type="TXT"
                          host={
                            verification.DKIMPendingHost ||
                            verification.DKIMHost
                          }
                          value={
                            verification.DKIMPendingTextValue ||
                            verification.DKIMTextValue
                          }
                        />
                        <DnsRecord
                          label="Return-Path"
                          type="CNAME"
                          host={verification.ReturnPathDomain}
                          value={verification.ReturnPathDomainCNAMEValue}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={useInstantSender}
                  className="self-start text-sm text-gray-500 hover:text-gray-700 dark:text-neutral-400 dark:hover:text-neutral-200"
                >
                  Use Instant's address instead
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2 rounded-sm bg-gray-50 px-3 py-2 text-sm dark:bg-neutral-800">
                <span className="text-gray-600 dark:text-neutral-300">
                  {DEFAULT_SENDER_EMAIL}{' '}
                  <span className="text-gray-400 dark:text-neutral-500">
                    · Instant
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setCustomSender(true)}
                  className="shrink-0 text-blue-600 hover:underline dark:text-blue-400"
                >
                  Use your own domain
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <Label>Body</Label>
              <div className="inline-flex items-center rounded-sm bg-gray-100 p-0.5 text-sm dark:bg-neutral-800">
                {(['edit', 'preview'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setBodyTab(t)}
                    className={clsx(
                      'rounded px-2.5 py-1 capitalize',
                      bodyTab === t
                        ? 'bg-white shadow-sm dark:bg-neutral-700'
                        : 'text-gray-500 dark:text-neutral-400',
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            {showSendTest ? (
              <Button
                type="button"
                variant="subtle"
                size="mini"
                loading={isSendingTest}
                onClick={handleSendTest}
              >
                Send a test email
              </Button>
            ) : null}
          </div>

          {bodyTab === 'edit' ? (
            <>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-400 dark:text-neutral-500">
                <span>Variables:</span>
                <VariableName>code</VariableName>
                <VariableName>app_title</VariableName>
                <VariableName>user_email</VariableName>
                <VariableName>expiration</VariableName>
              </div>
              <div
                className={clsx(
                  'h-[28rem] overflow-hidden rounded-sm border dark:border-neutral-700',
                  {
                    'border-red-500': form.getError('bodyHtml'),
                  },
                )}
              >
                <CodeEditor
                  darkMode={darkMode}
                  className="dark:border-neutral-600"
                  language="html"
                  {...form.inputProps('bodyHtml')}
                />
              </div>
              {form.getError('bodyHtml') ? (
                <div className="text-sm text-red-600">
                  {form.getError('bodyHtml')}
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="overflow-hidden rounded-sm border dark:border-neutral-700">
                <div className="flex flex-col gap-0.5 border-b bg-gray-50 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800">
                  <div className="flex gap-2">
                    <span className="w-14 shrink-0 text-gray-400 dark:text-neutral-500">
                      From
                    </span>
                    <span className="truncate text-gray-600 dark:text-neutral-300">
                      {previewFrom}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="w-14 shrink-0 text-gray-400 dark:text-neutral-500">
                      Subject
                    </span>
                    <span className="truncate font-medium">
                      {previewSubject || '—'}
                    </span>
                  </div>
                </div>
                <iframe
                  title="Email preview"
                  sandbox=""
                  srcDoc={previewBody}
                  className="h-[28rem] w-full bg-white"
                />
              </div>
              <p className="text-xs text-gray-400 dark:text-neutral-500">
                A live approximation. Send a test to see it in a real inbox.
              </p>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button {...form.submitButtonProps()} />
          <ActionButton
            variant="secondary"
            label="Reset to default"
            submitLabel="Resetting..."
            errorMessage="Failed to reset template"
            onClick={async () => {
              if (template?.id) {
                await dashResponse.optimisticUpdate(
                  jsonMutate(
                    `${config.apiURI}/dash/apps/${app.id}/email_templates/${template?.id}`,
                    {
                      method: 'DELETE',
                      token,
                    },
                  ),
                );
              }

              form.reset(formDefaults);
              setCustomSender(false);
              setShowDnsRecords(false);
            }}
          />
        </div>
      </form>

      <MagicCodeExpirationSection app={app} />
    </div>
  );
}

function DnsRecord({
  label,
  type,
  host,
  value,
}: {
  label: string;
  type: string;
  host?: string;
  value?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-gray-400 dark:text-neutral-500">{type}</span>
      </div>
      <div>
        <div className="mb-1 text-xs text-gray-500 dark:text-neutral-400">
          Hostname
        </div>
        <code className="block rounded-sm bg-gray-100 px-2 py-1 text-xs break-all select-all dark:bg-neutral-800">
          {host}
        </code>
      </div>
      <div>
        <div className="mb-1 text-xs text-gray-500 dark:text-neutral-400">
          Value
        </div>
        <code className="block rounded-sm bg-gray-100 px-2 py-1 text-xs break-all select-all dark:bg-neutral-800">
          {value}
        </code>
      </div>
    </div>
  );
}

const EXPIRY_OPTIONS = [
  { label: '10 minutes', value: 10 },
  { label: '1 hour', value: 60 },
  { label: '24 hours', value: 1440 },
];

function MagicCodeExpirationSection({ app }: { app: InstantApp }) {
  const dashResponse = useFetchedDash();
  const token = useContext(TokenContext);
  const dialog = useDialog();
  const currentExpiry = app.magic_code_expiry_minutes ?? undefined;
  const [selected, setSelected] = useState<number | undefined>(currentExpiry);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!selected) return;
    setIsSaving(true);
    try {
      await dashResponse.optimisticUpdate(
        jsonMutate(
          `${config.apiURI}/dash/apps/${app.id}/set-magic-code-expiry`,
          { body: { expiry: selected }, token },
        ),
      );
      successToast('Magic code expiration updated!');
      dialog.onClose();
    } catch {
      errorToast('Failed to update expiration.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="border-t pt-4 dark:border-neutral-800">
      <button
        type="button"
        className="text-sm text-gray-500 hover:text-gray-700 dark:text-neutral-400 dark:hover:text-neutral-200"
        onClick={() => {
          setSelected(currentExpiry);
          dialog.onOpen();
        }}
      >
        Codes expire after {expirationLabel(app.magic_code_expiry_minutes)} ·
        Change
      </button>
      <Dialog title="Magic Code Lifetime" {...dialog}>
        <div className="flex flex-col gap-4">
          <SubsectionHeading>Magic Code Lifetime</SubsectionHeading>
          <Content className="text-sm">
            Choose how long magic codes remain valid.
          </Content>
          <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
            <strong>Recommended: 10 minutes.</strong> Shorter lifetimes reduce
            the window for code interception.
          </div>
          <div className="flex flex-col gap-2">
            {EXPIRY_OPTIONS.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-center gap-2 rounded border p-3 dark:border-neutral-700"
              >
                <input
                  type="radio"
                  name="expiry"
                  checked={selected === option.value}
                  onChange={() => setSelected(option.value)}
                />
                <span className="text-sm">{option.label}</span>
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={dialog.onClose} variant="subtle">
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              loading={isSaving}
              variant="primary"
              disabled={!selected || selected === currentExpiry}
            >
              Save
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function VariableName({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-sm border bg-white px-1 font-mono dark:border-neutral-700 dark:bg-neutral-800">
      {'{'}
      {children}
      {'}'}
    </span>
  );
}

const defaultMagicCodeEmailHtml = /* html */ `<div style="background: #f6f6f6; font-family: Helvetica, Arial, sans-serif; line-height: 1.6; font-size: 18px;">
  <div style="max-width: 650px; margin: 0 auto; background: white; padding: 20px;">
    <p><strong>Welcome,</strong></p>
    <p>
      You asked to join {app_title}. To complete your registration, use this
      verification code:
    </p>
    <h2 style="text-align: center"><strong>{code}</strong></h2>
    <p>
      Copy and paste this into the confirmation box, and you'll be on your way.
    </p>
    <p>
      Note: This code will expire in {expiration}, and can only be used once. If
      you didn't request this code, please reply to this email.
    </p>
  </div>
</div>
`;

const formDefaults = {
  subject: DEFAULT_MAGIC_CODE_SUBJECT,
  bodyHtml: defaultMagicCodeEmailHtml,
  from: '',
  senderEmail: '',
};

function validateTemplate(v: string) {
  if (!v.includes('{code}')) {
    return { error: 'Must include the template variable {code}' };
  }
}
