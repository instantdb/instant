import { FormEventHandler, useContext, useState } from 'react';
import { errorToast } from '@/lib/toast';
import config from '@/lib/config';
import {
  AuthorizedOrigin,
  AuthorizedOriginService,
  InstantApp,
  InstantIssue,
  OAuthClient,
  OAuthServiceProvider,
} from '@/lib/types';
import { jsonFetch } from '@/lib/fetch';
import { TokenContext } from '@/lib/contexts';
import { messageFromInstantError } from '@/lib/errors';
import {
  Button,
  Content,
  Dialog,
  Label,
  SectionHeading,
  SubsectionHeading,
  Select,
  TextInput,
  useDialog,
} from '@/components/ui';
import {
  InformationCircleIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/solid';
import {
  DevicePhoneMobileIcon,
  GlobeAltIcon,
} from '@heroicons/react/24/outline';
import NetlifyIcon from '../../icons/NetlifyIcon';
import VercelIcon from '../../icons/VercelIcon';

export function addAuthorizedOrigin({
  token,
  appId,
  service,
  params,
}: {
  token: string;
  appId: string;
  service: string;
  params: string[];
}): Promise<{ origin: AuthorizedOrigin }> {
  return jsonFetch(
    `${config.apiURI}/dash/apps/${appId}/authorized_redirect_origins`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ service, params }),
    },
  );
}

export function removeAuthorizedOrigin({
  token,
  appId,
  originId,
}: {
  token: string;
  appId: string;
  originId: string;
}): Promise<{ origin: AuthorizedOrigin }> {
  return jsonFetch(
    `${config.apiURI}/dash/apps/${appId}/authorized_redirect_origins/${originId}`,
    {
      method: 'DELETE',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    },
  );
}

const serviceOptions: { label: string; value: AuthorizedOriginService }[] = [
  { label: 'Website', value: 'generic' },
  { label: 'Vercel previews', value: 'vercel' },
  { label: 'Netlify previews', value: 'netlify' },
  { label: 'App scheme', value: 'custom-scheme' },
];

// TODO(dww): Parse url to suggest adding a netlify or vercel project
export function AuthorizedOriginsForm({
  app,
  onAddOrigin,
  onCancel,
}: {
  app: InstantApp;
  onAddOrigin: (origin: AuthorizedOrigin) => void;
  onCancel: () => void;
}) {
  const token = useContext(TokenContext);
  const [url, setUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [service, setService] = useState<AuthorizedOriginService>('generic');

  const validateUrl = (
    originParam: string,
    service: AuthorizedOriginService,
  ):
    | { type: 'error'; message: string }
    | { type: 'success'; params: string[] } => {
    switch (service) {
      case 'netlify': {
        return { type: 'success', params: [originParam] };
      }
      case 'vercel': {
        return { type: 'success', params: ['vercel.app', originParam] };
      }
      case 'custom-scheme': {
        try {
          const url = new URL(originParam);
          // Remove final `:` from protocol to get scheme
          const scheme = url.protocol.slice(0, -1);
          return { type: 'success', params: [scheme] };
        } catch (e) {
          return { type: 'error', message: 'Invalid scheme.' };
        }
      }
      case 'generic':
        try {
          const url = new URL(originParam);
          const host = url.host;
          if (!host) {
            throw new Error('missing host');
          }
          // Allows localhost:port, but not just localhost
          if (host.split('.').length === 1 && !url.port) {
            throw new Error('invalid url');
          }
          return { type: 'success', params: [host] };
        } catch (e) {
          if (!originParam.startsWith('http')) {
            return validateUrl(`http://${originParam}`, service);
          }
          return { type: 'error', message: 'Invalid URL.' };
        }
      default: {
        return { type: 'error', message: 'Unknown type' };
      }
    }
  };
  const onSubmit: FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const validated = validateUrl(url, service);
      if (validated.type === 'error') {
        errorToast(validated.message, { autoClose: 5000 });
        return;
      }
      const resp = await addAuthorizedOrigin({
        token,
        appId: app.id,
        service: service,
        params: validated.params,
      });
      onAddOrigin(resp.origin);
    } catch (e) {
      console.error(e);
      const msg =
        messageFromInstantError(e as InstantIssue) || 'Error creating origin.';
      errorToast(msg, { autoClose: 5000 });
    } finally {
      setIsLoading(false);
    }
  };
  const TypeHelp = ({ text }: { text: string }) => {
    return (
      <Content className="flex flex-row items-center gap-1 text-sm">
        <span>
          <InformationCircleIcon className="" height="1em" />
        </span>
        <span>{text}</span>
      </Content>
    );
  };
  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 border rounded p-4"
    >
      <div className="flex flex-row gap-2">
        <div className="flex flex-col gap-2">
          <Label>Type</Label>
          <Select
            options={serviceOptions}
            onChange={(v) => {
              if (v) {
                setService(v.value as AuthorizedOriginService);
              }
            }}
            value={service}
          />
        </div>
        <div className="flex-grow">
          <TextInput
            value={url}
            onChange={setUrl}
            label={originInputLabel(service)}
            placeholder={originInputPlaceholder(service)}
          />
        </div>
      </div>
      {service === 'vercel' ? (
        <TypeHelp text="Vercel preview origins will allow all preview urls for the project." />
      ) : null}
      {service === 'netlify' ? (
        <TypeHelp text="Netlify preview origins will allow all preview urls for the site." />
      ) : null}
      {service === 'custom-scheme' ? (
        <TypeHelp text="Use app scheme if you're implementing the OAuth flow in a native app." />
      ) : null}
      <div className="flex flex-row gap-2">
        <Button loading={isLoading} variant="primary" type="submit">
          Add
        </Button>
        <Button variant="secondary" onClick={() => onCancel()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function originDisplay(origin: AuthorizedOrigin) {
  switch (origin.service) {
    case 'generic':
      return origin.params[0];
    case 'netlify':
      return origin.params[0];
    case 'vercel':
      return origin.params[1];
    case 'custom-scheme':
      return `${origin.params[0]}://`;
    default:
      return origin.params[0];
  }
}

export function originIcon(origin: AuthorizedOrigin) {
  switch (origin.service) {
    case 'generic':
      return GlobeAltIcon;
    case 'netlify':
      return NetlifyIcon;
    case 'vercel':
      return VercelIcon;
    case 'custom-scheme':
      return DevicePhoneMobileIcon;
    default:
      return GlobeAltIcon;
  }
}

export function originSource(origin: AuthorizedOrigin) {
  switch (origin.service) {
    case 'generic':
      return 'Website';
    case 'netlify':
      return 'Netlify site';
    case 'vercel':
      if (origin.params[0] !== 'vercel.app') {
        return `Vercel project (${origin.params[0]})`;
      }
      return 'Vercel project';
    case 'custom-scheme':
      return 'Native app';
    default:
      return '';
  }
}

export function originInputLabel(service: AuthorizedOriginService) {
  switch (service) {
    case 'generic':
      return 'Origin domain';
    case 'netlify':
      return 'Netlify site';
    case 'vercel':
      return 'Vercel project';
    case 'custom-scheme':
      return 'App scheme';
    default:
      return '';
  }
}

export function originInputPlaceholder(service: AuthorizedOriginService) {
  switch (service) {
    case 'generic':
      return 'example.com';
    case 'netlify':
      return 'netlify-site-name';
    case 'vercel':
      return 'vercel-project-name';
    case 'custom-scheme':
      return 'app-scheme://';
    default:
      return '';
  }
}

export function AuthorizedOriginRow({
  app,
  origin,
  onRemoveOrigin,
}: {
  app: InstantApp;
  origin: AuthorizedOrigin;
  onRemoveOrigin: (origin: AuthorizedOrigin) => void;
}) {
  const token = useContext(TokenContext);
  const deleteDialog = useDialog();
  const [isLoading, setIsLoading] = useState(false);
  const handleRemoveOrigin = async () => {
    try {
      setIsLoading(true);
      const resp = await removeAuthorizedOrigin({
        token,
        appId: app.id,
        originId: origin.id,
      });
      deleteDialog.onClose();
      onRemoveOrigin(resp.origin);
    } catch (e) {
      console.error(e);
      const msg =
        messageFromInstantError(e as InstantIssue) || 'Error removing origin.';
      errorToast(msg, { autoClose: 5000 });
    } finally {
      setIsLoading(false);
    }
  };

  const Icon = originIcon(origin);

  return (
    <div className="flex items-center justify-between rounded border p-4 bg-gray-50">
      <div className="flex items-center gap-4">
        <Icon height="1.5em" />
        <div className="flex flex-col leading-4">
          <span className="text-xs font-light text-gray-500">
            {originSource(origin)}
          </span>
          <span className="font-medium text-gray-700">
            {originDisplay(origin)}
          </span>
        </div>
      </div>
      <button onClick={deleteDialog.onOpen}>
        <TrashIcon height={'1rem'} className="" />
      </button>
      <Dialog {...deleteDialog}>
        <div className="flex flex-col gap-2">
          <SubsectionHeading>Delete {originDisplay(origin)}</SubsectionHeading>
          <Content>
            Deleting the origin will prevent users from using logging in to your
            app with an OAuth service from this origin.
          </Content>
          <Button
            loading={isLoading}
            variant="destructive"
            onClick={handleRemoveOrigin}
          >
            Delete
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

export function AuthorizedOrigins({
  app,
  origins,
  onAddOrigin,
  onRemoveOrigin,
}: {
  app: InstantApp;
  origins: AuthorizedOrigin[];
  onAddOrigin: (origin: AuthorizedOrigin) => void;
  onRemoveOrigin: (origin: AuthorizedOrigin) => void;
}) {
  const [showAddOriginForm, setShowAddOriginForm] = useState(
    origins.length === 0,
  );
  return (
    <div className="flex gap-2 flex-col">
      <div>
        <SectionHeading>Redirect Origins </SectionHeading>
        <Content className="text-gray-500 text-sm">
          Add your site's url so that you can initiate the OAuth flow from your
          site.
        </Content>
      </div>

      {showAddOriginForm ? null : (
        <Button onClick={() => setShowAddOriginForm(true)} variant="secondary">
          <PlusIcon height={14} /> Add an origin
        </Button>
      )}

      {showAddOriginForm ? (
        <>
          <AuthorizedOriginsForm
            app={app}
            onAddOrigin={(origin) => {
              setShowAddOriginForm(false);
              onAddOrigin(origin);
            }}
            onCancel={() => setShowAddOriginForm(false)}
          />
        </>
      ) : null}

      <>
        {origins.map((o) => {
          return (
            <AuthorizedOriginRow
              key={o.id}
              app={app}
              origin={o}
              onRemoveOrigin={onRemoveOrigin}
            />
          );
        })}
      </>
    </div>
  );
}
