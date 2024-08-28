import { useContext, useMemo, useState } from 'react';
import { SWRResponse } from 'swr';
import JsonParser from 'json5';

import { errorToast, successToast } from '@/lib/toast';
import config from '@/lib/config';
import { jsonFetch } from '@/lib/fetch';
import { TokenContext } from '@/lib/contexts';
import { InstantApp, DashResponse } from '@/lib/types';
import { Button, Content, JSONEditor, SectionHeading } from '@/components/ui';
import { HomeButton } from '@/pages/dash';

export function Perms({
  app,
  dashResponse,
}: {
  app: InstantApp;
  dashResponse: SWRResponse<DashResponse>;
}) {
  const [errorRes, setErrorRes] = useState<{
    message: string;
    in: string[];
  } | null>(null);
  const token = useContext(TokenContext);
  const value = useMemo(() => {
    return app.rules ? JSON.stringify(app.rules, null, 2) : '';
  }, [app]);

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <div className="flex flex-col gap-4 border-r p-4 text-sm md:basis-96 md:text-base">
        <SectionHeading>Permissions</SectionHeading>
        <Content>
          <p>
            Ready to share your app with the world? You likely need to add some
            permissions. You can define them here
          </p>
          <p>
            Under the hood, Instant uses the CEL Expression Language. Check out
            the docs to learn more about permission rules and how you can write
            them.
          </p>
        </Content>
        <HomeButton href="/docs/permissions" title="Using Permissions">
          Learn how to use CEL expressions to secure your app
        </HomeButton>
      </div>
      <div className="flex w-full flex-1 flex-col justify-start">
        {errorRes && (
          <div className="bg-red-100 p-4 text-sm">
            <div className="max-w-sm">
              <h4 className="font-bold text-red-700">
                There was an error in {errorRes.in.join('->')}
              </h4>
              <pre className="whitespace-pre-wrap">{errorRes.message}</pre>
            </div>
          </div>
        )}
        <JSONEditor
          label={
            <>
              <span
                className="text-sm font-bold text-yellow-600"
                style={{ letterSpacing: '4px' }}
              >
                {'{}'}
              </span>{' '}
              rules.json
            </>
          }
          value={value}
          schema={rulesSchema}
          onSave={async (r) => {
            const er = await onEditRules(dashResponse, app.id, r, token).catch(
              (error) => error
            );
            setErrorRes(er);
          }}
        />
      </div>
    </div>
  );
}

async function onEditRules(
  dashResponse: SWRResponse<any, any, any>,
  appId: string,
  newRules: string,
  token: string
): Promise<void> {
  if (dashResponse.error || dashResponse.isLoading) {
    return Promise.reject(null);
  }
  const prevApps = dashResponse.data.apps;
  const currentApp = prevApps.find((x: any) => x.id === appId);
  if (!currentApp) {
    return Promise.reject({ message: null });
  }
  let newRulesObj: any = null;
  try {
    newRulesObj = JsonParser.parse(newRules, (key, value) => {
      // rules.json permissions require that "true" and "false" be strings
      if (value === true) {
        return 'true';
      } else if (value === false) {
        return 'false';
      } else {
        return value;
      }
    });
  } catch (e) {
    errorToast('Beep boop. Please use valid JSON', { autoClose: 3000 });
    return Promise.reject(null);
  }
  const updatedApp = { ...currentApp, rules: newRulesObj };

  const updatedApps = prevApps.map((x: any) => {
    if (x.id === appId) {
      return updatedApp;
    }
    return x;
  });

  return updateRules(token, appId, newRulesObj)
    .then(() => {
      dashResponse.mutate({ ...dashResponse.data, apps: updatedApps });
      successToast('Huzzah. Your rules have been updated!');
    })
    .catch((e: any) => {
      const validationErr = e.body?.hint?.errors?.[0];
      if (validationErr) {
        return Promise.reject(validationErr);
      }
      errorToast(
        "Oh no, we weren't able to save these rules. Please try again or ping us on Discord if you're stuck!",
        { autoClose: 3000 }
      );
      return Promise.reject();
    });
}

function updateRules(token: string, appId: string, newRulesObj: object) {
  return jsonFetch(`${config.apiURI}/dash/apps/${appId}/rules`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ code: newRulesObj }),
  });
}

export const rulesSchema = {
  type: 'object',
  patternProperties: {
    '^[$a-zA-Z0-9_\\-]+$': {
      type: 'object',
      properties: {
        allow: {
          type: 'object',
          properties: {
            create: { type: 'string' },
            update: { type: 'string' },
            delete: { type: 'string' },
            view: { type: 'string' },
          },
          additionalProperties: false,
        },
        bind: {
          type: 'array',
          // Use a combination of "items" and "additionalItems" for validation
          items: { type: 'string' },
          minItems: 2,
        },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
};
