import { useContext, useState, useEffect } from 'react';
import config from '@/lib/config';
import { jsonMutate, jsonFetch } from '@/lib/fetch';
import { APIResponse } from '@/lib/auth';
import { TokenContext } from '@/lib/contexts';
import { DashResponse, InstantApp } from '@/lib/types';
import {
  ActionButton,
  BlockHeading,
  Button,
  CodeEditor,
  Content,
  Label,
  SectionHeading,
  SubsectionHeading,
  TextInput,
} from '@/components/ui';
import { displayInstantStandardError, useForm } from '@/lib/hooks/useForm';
import { errorToast, successToast } from '@/lib/toast';
import clsx from 'clsx';

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

export function Email({
  dashResponse,
  app,
}: {
  dashResponse: APIResponse<DashResponse>;
  app: InstantApp;
  nav: (p: { s: string; t?: string; app?: string }) => void;
}) {
  const template = app.magic_code_email_template;
  const token = useContext(TokenContext);
  const [isEditing, setIsEditing] = useState(Boolean(template) ?? false);
  const [{ isVerifying, verification }, setVerification] = useState<{
    isVerifying: boolean;
    verification: SenderVerificationInfo | null;
  }>({
    isVerifying: false,
    verification: null,
  });

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
    validators: {
      subject: validateTemplate,
      bodyHtml: (v) => validateTemplate(v) || validateHtml(v),
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

  if (!isEditing) {
    return (
      <div className="flex flex-col gap-2">
        <SectionHeading>Custom Magic Code Email</SectionHeading>
        <Button onClick={() => setIsEditing(true)}>
          Customize your magic code email
        </Button>
      </div>
    );
  }
  return (
    <form {...form.formProps()} className="flex flex-col gap-2">
      <SectionHeading>Custom Magic Code Email</SectionHeading>

      <div className="border p-3 bg-gray-50 rounded flex flex-col gap-1">
        <BlockHeading>Template variables</BlockHeading>
        <Content className="text-sm">
          We provide a few dynamic variables for you to use in your email:
          <ul>
            <li>
              <VariableName>code</VariableName>, the magic code e.g.{' '}
              <strong>123456</strong>
            </li>
            <li>
              <VariableName>app_title</VariableName>, your app's title, i.e.{' '}
              <strong>{app.title}</strong>
            </li>
            <li>
              <VariableName>user_email</VariableName>, the user's email address,
              e.g. <strong>happyuser@gmail.com</strong>
            </li>
          </ul>
        </Content>
        <Content className="text-sm">
          <strong>Note:</strong> <VariableName>code</VariableName>
          is required in both the subject and body.
        </Content>
      </div>

      <TextInput
        {...form.inputProps('subject')}
        label="Subject"
        placeholder="Hey there!  Your code for {app_title} is: {code}"
      />

      <TextInput
        {...form.inputProps('from')}
        label="From"
        placeholder="YourName from YourCo"
      />

      <div className="flex flex-col gap-1">
        <Label>Body (HTML or plain-text)</Label>
        <div
          className={clsx('h-64 border rounded', {
            'border-red-500': form.getError('bodyHtml'),
          })}
        >
          <CodeEditor language="html" {...form.inputProps('bodyHtml')} />
        </div>
        {form.getError('bodyHtml') ? (
          <div className="text-sm text-red-600">
            {form.getError('bodyHtml')}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 border p-3 bg-gray-50 rounded">
        <SubsectionHeading>
          Use a custom 'From' address (optional)
        </SubsectionHeading>
        <Content className="text-sm">
          By default emails are sent from our domain. Add a custom sender to
          send emails from your own domain and build trust with recipients. Our
          email partner will send a confirmation to the provided address with a
          link to verify.
        </Content>
        <TextInput
          {...form.inputProps('senderEmail')}
          label="Sender email address"
          placeholder="hi@yourdomain.co"
        />
      </div>

      {verification && (
        <div className="flex flex-col gap-2 border p-3 bg-gray-50 rounded">
          <div className="flex items-center justify-between">
            <SubsectionHeading>
              Verify {verification.EmailAddress}
            </SubsectionHeading>
            <Button
              onClick={checkVerification}
              loading={isVerifying}
              variant="primary"
              size="mini"
            >
              Refresh Status
            </Button>
          </div>

          <div className="border rounded-lg p-4 bg-white">
            <div className="flex items-center justify-between mb-2">
              <div className="font-medium text-sm">Email Confirmation</div>
              <div className="flex items-center gap-2">
                <StatusCircle
                  isLoading={isVerifying}
                  isSuccess={verification.Confirmed}
                />
                {verification.Confirmed ? (
                  <div className="text-green-600 text-xs font-medium">
                    Confirmed
                  </div>
                ) : (
                  <div className="text-gray-500 text-xs">
                    Pending confirmation
                  </div>
                )}
              </div>
            </div>
            <Content className="text-sm text-gray-600">
              {verification.Confirmed
                ? `Great! You've confirmed ${verification.EmailAddress} and can now send emails from this address.`
                : `We've sent a confirmation email to ${verification.EmailAddress}. Please click the link in that email to confirm ownership.`}
            </Content>
          </div>

          {/* Domain Verification */}
          <div className="border rounded-lg p-4 bg-white">
            <div className="flex items-center justify-between mb-2">
              <div className="font-medium text-sm">
                Bonus: Domain Verification
              </div>
            </div>

            <Content className="text-sm text-gray-600 mb-3">
              Add DNS records to improve email deliverability and avoid spam
              filters.
            </Content>

            <div className="border rounded-lg overflow-hidden mb-3">
              <div className="grid grid-cols-[1fr_80px_2fr] bg-gray-50 border-b text-sm font-medium text-gray-700 px-4 py-3">
                <div>Record</div>
                <div>Type</div>
                <div>Value</div>
              </div>
              <div className="grid grid-cols-[1fr_80px_2fr] border-b px-4 py-3 text-sm">
                <div className="flex gap-3">
                  <div className="font-medium">DKIM</div>
                </div>
                <div className="flex text-gray-600 text-sm">TXT</div>
                <div className="flex flex-col gap-2">
                  <div>
                    <div className="text-xs text-gray-600 mb-1">Hostname:</div>
                    <code className="text-xs bg-gray-100 px-2 py-1 rounded break-all select-all block">
                      {verification.DKIMPendingHost || verification.DKIMHost}
                    </code>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 mb-1">Value:</div>
                    <code className="text-xs bg-gray-100 px-2 py-1 rounded break-all select-all block">
                      {verification.DKIMPendingTextValue ||
                        verification.DKIMTextValue}
                    </code>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-[1fr_80px_2fr] px-4 py-3 text-sm">
                <div className="flex items-center gap-3">
                  <div className="font-medium">Return-Path</div>
                </div>
                <div className="flex items-center text-gray-600 text-sm">
                  CNAME
                </div>
                <div className="flex flex-col gap-2">
                  <div>
                    <div className="text-xs text-gray-600 mb-1">Hostname:</div>
                    <code className="text-xs bg-gray-100 px-2 py-1 rounded break-all select-all block">
                      {verification.ReturnPathDomain}
                    </code>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 mb-1">Value:</div>
                    <code className="text-xs bg-gray-100 px-2 py-1 rounded break-all select-all block">
                      {verification.ReturnPathDomainCNAMEValue}
                    </code>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <Button {...form.submitButtonProps()} />

      <>
        <ActionButton
          variant="destructive"
          label="Delete template"
          submitLabel="Deleting..."
          errorMessage="Failed to delete template"
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
            setIsEditing(false);
          }}
        />
      </>
    </form>
  );
}

function VariableName({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-sm bg-white rounded px-1 border">
      {'{'}
      {children}
      {'}'}
    </span>
  );
}

const defaultMagicCodeEmailHtml = /* html */ `<div style="background: #f6f6f6; font-family: Helvetica, Arial, sans-serif; line-height: 1.6; font-size: 18px;">
  <div style="max-width: 650px; margin: 0 auto; background: white; padding: 20px">
    <div style="background: #f6f6f6; font-family: Helvetica, Arial, sans-serif; line-height: 1.6; font-size: 18px;">
      <div style="max-width: 650px; margin: 0 auto; background: white; padding: 20px;">
        <p><strong>Welcome,</strong></p>
        <p>
          You asked to join {app_title}. To complete your registration, use this
          verification code:
        </p>
        <h2 style="text-align: center"><strong>{code}</strong></h2>
        <p>
          Copy and paste this into the confirmation box, and you'll be on your
          way.
        </p>
        <p>
          Note: This code will expire in 24 hours, and can only be used once. If
          you didn't request this code, please reply to this email.
        </p>
      </div>
    </div>
  </div>
</div>
`;

const formDefaults = {
  subject: '{code} is your code for {app_title}',
  bodyHtml: defaultMagicCodeEmailHtml,
  from: '',
  senderEmail: '',
};

function validateTemplate(v: string) {
  if (!v.includes('{code}')) {
    return { error: 'Must include the template variable {code}' };
  }
}

function validateHtml(xmlStr: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(
    `<body>${xmlStr}</body>`,
    'application/xml',
  );
  const errorNode = doc.querySelector('parsererror');

  if (errorNode) {
    return { error: 'Invalid HTML' };
  }
}

function StatusCircle({
  isLoading,
  isSuccess,
}: {
  isLoading?: boolean;
  isSuccess: boolean;
}) {
  if (isLoading) {
    return <div className="w-3 h-3 rounded-full bg-gray-400"></div>;
  }

  if (isSuccess) {
    return (
      <div className="w-3 h-3 rounded-full bg-green-500 flex items-center justify-center">
        <span className="text-white text-xs">✓</span>
      </div>
    );
  }

  return <div className="w-3 h-3 rounded-full bg-red-500"></div>;
}
