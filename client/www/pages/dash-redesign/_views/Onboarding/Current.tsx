import { useState } from 'react';
import {
  Button,
  Content,
  LogoIcon,
  ScreenHeading,
  SubsectionHeading,
  TextInput,
} from '@/components/ui';
import { OnboardingShell } from '../_shared';
import { OnboardingStage } from './index';

type ExperienceLevel = 'vibe-dev' | 'junior-dev' | 'senior-dev';

const experienceOptions: {
  value: ExperienceLevel;
  label: string;
  description: string;
}[] = [
  {
    value: 'vibe-dev',
    label: 'Vibe Coder',
    description: "I can use AI tools to build but I'm not a developer.",
  },
  {
    value: 'junior-dev',
    label: 'Know some code',
    description: "I can code but I'm not a pro yet.",
  },
  {
    value: 'senior-dev',
    label: 'Engineer',
    description: "I've been coding for several years professionally.",
  },
];

function WelcomeStage() {
  const setupItems = [
    ['Profile', 'Tell us how you build.'],
    ['App', 'Name the first project.'],
    ['Dashboard', 'Land in a configured workspace.'],
  ];

  return (
    <div className="grid w-full max-w-5xl gap-8 p-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center">
      <div className="flex max-w-2xl flex-col gap-5">
        <span className="inline-flex items-center gap-2.5">
          <LogoIcon size="normal" />
          <span className="text-2xl font-semibold tracking-normal text-gray-950 lowercase dark:text-white">
            instant
          </span>
        </span>
        <div className="space-y-3">
          <ScreenHeading>Welcome to Instant</ScreenHeading>
          <Content className="text-xl leading-8 text-gray-950 dark:text-neutral-200">
            Set up your profile, name an app, and land in a workspace with auth,
            schema, explorer, and sandbox ready.
          </Content>
        </div>
        <Button className="w-fit" size="xl" onClick={() => {}}>
          Start setup
        </Button>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <SubsectionHeading>Setup path</SubsectionHeading>
        <div className="mt-4 flex flex-col gap-3">
          {setupItems.map(([title, description], index) => (
            <div key={title} className="flex gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-[#fbfaf8] text-xs font-semibold text-gray-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                {index + 1}
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-950 dark:text-white">
                  {title}
                </div>
                <div className="text-sm text-gray-500 dark:text-neutral-400">
                  {description}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProfileStage() {
  const [heard, setHeard] = useState('');
  const [experience, setExperience] = useState<ExperienceLevel | undefined>();
  return (
    <form
      onSubmit={(e) => e.preventDefault()}
      className="flex w-full max-w-[560px] flex-col gap-6 p-6"
    >
      <ScreenHeading className="text-center">
        Tell us about yourself
      </ScreenHeading>
      <TextInput
        size="large"
        label="How did you hear about us?"
        placeholder="Twitter, Bookface, Hacker News, etc?"
        value={heard}
        onChange={(v) => setHeard(v)}
      />
      <div className="flex flex-col gap-2">
        <label className="text-sm font-bold text-gray-700 dark:text-neutral-400">
          What's your coding experience?
        </label>
        <div className="flex flex-col gap-2">
          {experienceOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setExperience(option.value)}
              className={`flex flex-col gap-1 rounded-md border p-3 text-left transition-colors hover:cursor-pointer ${
                experience === option.value
                  ? 'border-[#606AF4] bg-[#606AF4]/5 dark:border-[#8f95ff] dark:bg-[#8f95ff]/10'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-[#fbfaf8] dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-500 dark:hover:bg-neutral-800'
              }`}
            >
              <span className="font-medium">{option.label}</span>
              <span className="text-sm text-gray-500 dark:text-neutral-400">
                {option.description}
              </span>
            </button>
          ))}
        </div>
      </div>
      <Button
        size="large"
        type="submit"
        disabled={heard.trim().length === 0 || !experience}
      >
        Onwards!
      </Button>
    </form>
  );
}

function CreateAppStage() {
  const [appName, setAppName] = useState('');
  return (
    <div className="w-full max-w-[660px] p-6">
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => e.preventDefault()}
      >
        <ScreenHeading className="text-center">Name your app</ScreenHeading>
        <Content className="text-center text-lg leading-7">
          You're in! Time to build your first app. What would you like to call
          it?
        </Content>
        <TextInput
          size="jumbo"
          placeholder="Name your app"
          value={appName}
          onChange={(v) => setAppName(v)}
        />
        <Button
          size="jumbo"
          type="submit"
          disabled={appName.trim().length === 0}
        >
          Let's build!
        </Button>
      </form>
    </div>
  );
}

export function Current({ stage }: { stage: OnboardingStage }) {
  return (
    <OnboardingShell>
      {stage === 'welcome' && <WelcomeStage />}
      {stage === 'profile' && <ProfileStage />}
      {stage === 'create-app' && <CreateAppStage />}
    </OnboardingShell>
  );
}
