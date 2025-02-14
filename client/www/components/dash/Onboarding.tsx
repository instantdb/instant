import React, {
  Dispatch,
  SetStateAction,
  useContext,
  useEffect,
  useState,
} from 'react';

import { v4 } from 'uuid';

import config from '@/lib/config';
import { TokenContext } from '@/lib/contexts';
import { jsonFetch } from '@/lib/fetch';
import {
  Button,
  Content,
  Label,
  ScreenHeading,
  TextInput,
} from '@/components/ui';
import { useRouter } from 'next/router';
import { signOut } from '@/lib/auth';

type ProfileCreateState = { isLoading: boolean; error?: string };
type AppError = { body: { message: string } | undefined };
type Profile = { meta?: { heard?: string; build?: string } };
type DashState =
  | { isLoading: true; error: undefined; apps: undefined; profile: undefined }
  | { isLoading: false; error: AppError; apps: undefined; profile?: undefined }
  | { isLoading: false; error: undefined; apps: App[]; profile?: Profile };
type App = {
  id: string;
  title: string;
  admin_token: string;
  rules?: object;
};

function fetchDash(token: string) {
  return jsonFetch(`${config.apiURI}/dash`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
  });
}

export function submitProfile(token: string, profile: Profile) {
  return jsonFetch(`${config.apiURI}/dash/profiles`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(profile),
  });
}

export function createApp(
  token: string,
  toCreate: { id: string; title: string; admin_token: string },
) {
  return jsonFetch(`${config.apiURI}/dash/apps`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(toCreate),
  });
}

export function useDash(): [DashState, Dispatch<SetStateAction<DashState>>] {
  const token = useContext(TokenContext);
  const [state, setState] = useState<DashState>({
    isLoading: true,
    error: undefined,
    apps: undefined,
    profile: undefined,
  });
  useEffect(() => {
    fetchDash(token).then(
      (x) => {
        const { apps, profile } = x;
        setState({
          isLoading: false,
          error: undefined,
          profile,
          apps: apps.sort((a: any, b: any) => {
            const aCreatedAt = +new Date(a.created_at);
            const bCreatedAt = +new Date(b.created_at);
            return aCreatedAt - bCreatedAt;
          }),
        });
      },
      (err) => {
        setState({
          isLoading: false,
          error: err.body
            ? err
            : { body: { message: err.message || 'Uh oh, we goofed up' } },
          apps: undefined,
          profile: undefined,
        });
      },
    );
  }, [token]);

  return [state, setState];
}

export type AppCreateState = {
  isLoading: boolean;
  appName: string;
  error: string | undefined;
};

function WelcomeScreen({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="flex w-full max-w-sm flex-col gap-4 p-4">
        <div className="flex justify-center text-4xl">🎉️</div>
        <ScreenHeading className="text-center">
          Welcome to Instant
        </ScreenHeading>
        <Content>
          We're excited to have you! Before we get started, we need to do two
          things.
        </Content>
        <Button autoFocus onClick={onClick}>
          Let's go!
        </Button>
      </div>
    </div>
  );
}

function isBlank(str: string | undefined) {
  if (!str) return true;
  return str.trim().length === 0;
}

function ProfileScreen(props: {
  profileCreateState: ProfileCreateState;
  onProfileSubmit: (meta: Profile['meta']) => void;
}) {
  const { error, isLoading } = props.profileCreateState;
  const [heard, setHeard] = useState('');
  const [build, setBuild] = useState('');

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    props.onProfileSubmit({ heard, build });
  };

  return (
    <div className="flex h-full w-full items-center justify-center">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-4 p-4"
      >
        <div className="flex justify-center text-4xl">👋</div>
        <ScreenHeading className="text-center">
          Tell us about yourself
        </ScreenHeading>
        <TextInput
          autoFocus
          label="How did you hear about us?"
          placeholder="Twitter, Bookface, Hacker News, etc?"
          value={heard}
          onChange={(e) => setHeard(e)}
        />

        <Label className="flex flex-col gap-1">
          What do you want to build?
          <textarea
            id="build"
            name="build"
            className="w-full appearance-none rounded border-gray-200 placeholder-gray-400 outline-none font-normal"
            placeholder="Social media for books -- like goodreads, but with a better design. Something like zeneca.io but realtime!"
            value={build}
            onChange={(e) => setBuild(e.target.value)}
            rows={4}
          />
        </Label>
        <Button
          type="submit"
          disabled={isBlank(build) || isBlank(heard) || isLoading}
        >
          {isLoading ? '...' : 'Onwards!'}
        </Button>
        {error ? (
          <div className="mb-4 rounded bg-gray-200 p-2 text-orange-500">
            {error}
          </div>
        ) : null}
      </form>
    </div>
  );
}

function CreateFirstAppScreen(props: {
  isLoading: boolean;
  onCreate: () => void;
  appName: string;
  onAppNameChange: (appName: string) => void;
  error: string | undefined;
}) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="w-full max-w-sm p-4">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            props.onCreate();
          }}
        >
          <h1 className="flex justify-center text-4xl">🔥</h1>
          <ScreenHeading className="text-center">Name your app</ScreenHeading>
          <Content>
            You're in! Time to build your first app. What would you like to call
            it?
          </Content>
          <TextInput
            autoFocus
            placeholder="Name your app"
            value={props.appName}
            onChange={(t) => {
              props.onAppNameChange(t);
            }}
          />
          <Button
            type="submit"
            loading={props.isLoading}
            disabled={props.appName.trim().length === 0}
          >
            Let's build!
          </Button>
          {props.error ? (
            <div className="mb-4 rounded bg-gray-200 p-2 text-orange-500">
              {props.error}
            </div>
          ) : null}
        </form>
      </div>
    </div>
  );
}

export function OnboardingScreen(props: {
  profile?: Profile;
  profileCreateState: ProfileCreateState;
  onProfileSubmit: (meta: Profile['meta']) => void;
  appCreateState: AppCreateState;
  onAppNameChange: (appName: string) => void;
  onAppCreate: () => void;
}) {
  const { profile, appCreateState, onAppCreate, onAppNameChange } = props;
  const [step, setStep] = useState('welcome');

  if (step === 'welcome') {
    return (
      <WelcomeScreen
        onClick={() => {
          setStep(profile ? 'create' : 'profile');
        }}
      />
    );
  }

  if (!profile) {
    return <ProfileScreen {...props} />;
  }

  return (
    <CreateFirstAppScreen
      isLoading={appCreateState.isLoading}
      appName={appCreateState.appName}
      onAppNameChange={onAppNameChange}
      error={appCreateState.error}
      onCreate={onAppCreate}
    />
  );
}

function WithSignOut({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  return (
    <div className="flex h-full w-full">
      <div className="absolute right-0 top-0 p-4">
        <Button
          className="w-full"
          size="mini"
          variant="subtle"
          onClick={() => {
            router.push('/');
            setTimeout(() => {
              signOut();
            }, 150);
          }}
        >
          Sign out
        </Button>
      </div>
      {children}
    </div>
  );
}

export function Onboarding({
  onCreate,
}: {
  onCreate: (p: { id: string }) => void;
}) {
  const token = useContext(TokenContext);
  const [dashState, setDashState] = useDash();
  const [appCreateState, setAppCreateState] = useState<AppCreateState>({
    isLoading: false,
    appName: '',
    error: undefined,
  });
  const [profileCreateState, setProfileCreateState] =
    useState<ProfileCreateState>({
      isLoading: false,
      error: undefined,
    });
  const [selectedPage, setSelectedPage] = useState<
    'create-app' | 'newbie-create-app' | string | undefined
  >(undefined);

  const onAppNameChange = (appName: string) =>
    setAppCreateState((prev) => ({ ...prev, appName }));

  const onProfileSubmit = (meta: Profile['meta']) => {
    if (dashState.error || dashState.isLoading || profileCreateState.isLoading)
      return;
    const profile = { meta: meta };
    setProfileCreateState({ isLoading: true });
    submitProfile(token, profile).then(
      () => {
        setProfileCreateState({ isLoading: false });
        setDashState({
          ...dashState,
          profile: profile,
        });
      },
      (e: AppError) => {
        setProfileCreateState({
          isLoading: false,
          error: e.body?.message || 'Uh oh, we goofed up. Please ping us',
        });
        setDashState({
          ...dashState,
          profile: undefined,
        });
      },
    );
  };

  const onAppCreate = () => {
    if (dashState.error || dashState.isLoading) return;
    const toCreate = {
      id: v4(),
      title: appCreateState.appName.trim(),
      admin_token: v4(),
    };
    const prevSelectedAppId = selectedPage;
    setAppCreateState((prev) => ({ ...prev, isLoading: true }));
    setDashState({
      ...dashState,
      apps: [...dashState.apps, toCreate],
    });

    createApp(token, toCreate).then(
      () => {
        onCreate({ id: toCreate.id });
      },
      (e: AppError) => {
        setAppCreateState((prev) => ({
          ...prev,
          isLoading: false,
          error: e.body?.message || 'Uh oh, we goofed up. Please ping us',
        }));
        setDashState({
          ...dashState,
          apps: dashState.apps.filter((x) => x.id !== toCreate.id),
        });
        setSelectedPage(prevSelectedAppId);
      },
    );
  };

  return (
    <WithSignOut>
      <OnboardingScreen
        profile={dashState.profile}
        appCreateState={appCreateState}
        profileCreateState={profileCreateState}
        onProfileSubmit={onProfileSubmit}
        onAppNameChange={onAppNameChange}
        onAppCreate={onAppCreate}
      />
    </WithSignOut>
  );
}
