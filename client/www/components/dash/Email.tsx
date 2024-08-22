import { useContext, useState } from 'react';
import config from '@/lib/config';
import { jsonMutate } from '@/lib/fetch';
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
          }
        )
      )
      .then(
        () => {
          successToast('Email template saved!');
        },
        (errorRes) =>
          displayInstantStandardError(errorRes, form, {
            'sender-email': 'senderEmail',
            'sender-name': 'from',
            body: 'bodyHtml',
            subject: 'subject',
          })
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

        <Content className="text-gray-600 italic text-sm">
          If you provide a custom sender address, you'll need to confirm it
          before we can start delivering from it. Our email partner will send a
          confirmation to the provided address with a link to verify.
        </Content>

        <TextInput
          {...form.inputProps('senderEmail')}
          label="Sender email address"
          placeholder="hi@yourdomain.co"
        />
      </div>

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
                  }
                )
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
    'application/xml'
  );
  const errorNode = doc.querySelector('parsererror');

  if (errorNode) {
    return { error: 'Invalid HTML' };
  }
}
