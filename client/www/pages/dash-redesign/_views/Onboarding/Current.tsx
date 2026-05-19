import { useState } from 'react';
import { Button, Content, ScreenHeading, TextInput } from '@/components/ui';
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
  return (
    <div className="flex w-full max-w-sm flex-col gap-4 p-4">
      <div className="flex justify-center text-4xl">🎉️</div>
      <ScreenHeading className="text-center">Welcome to Instant</ScreenHeading>
      <Content>
        We're excited to have you! Before we get started, we need to do two
        things.
      </Content>
      <Button onClick={() => {}}>Let's go!</Button>
    </div>
  );
}

function ProfileStage() {
  const [heard, setHeard] = useState('');
  const [experience, setExperience] = useState<ExperienceLevel | undefined>();
  return (
    <form
      onSubmit={(e) => e.preventDefault()}
      className="flex w-full max-w-md flex-col gap-6 p-4"
    >
      <div className="flex justify-center text-4xl">👋</div>
      <ScreenHeading className="text-center">
        Tell us about yourself
      </ScreenHeading>
      <TextInput
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
                  ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20'
                  : 'border-gray-200 hover:border-gray-400 hover:bg-gray-50 dark:border-neutral-700 dark:hover:border-neutral-500 dark:hover:bg-neutral-800'
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
      <Button type="submit" disabled={heard.trim().length === 0 || !experience}>
        Onwards!
      </Button>
    </form>
  );
}

function CreateAppStage() {
  const [appName, setAppName] = useState('');
  return (
    <div className="w-full max-w-sm p-4">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => e.preventDefault()}
      >
        <h1 className="flex justify-center text-4xl">🔥</h1>
        <ScreenHeading className="text-center">Name your app</ScreenHeading>
        <Content>
          You're in! Time to build your first app. What would you like to call
          it?
        </Content>
        <TextInput
          placeholder="Name your app"
          value={appName}
          onChange={(v) => setAppName(v)}
        />
        <Button type="submit" disabled={appName.trim().length === 0}>
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
