import { useState } from 'react';
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { usePostHog } from 'posthog-js/react';
import {
  SectionHeading,
  SubsectionHeading,
  Copyable,
  Content,
  Select,
} from '@/components/ui';

/**
 * Converts an app title to a valid directory name.
 */
function toDirectoryName(title: string): string {
  const dirName = title
    .toLowerCase() // Convert to lowercase
    .replace(/[\s_]+/g, '-') // Replace spaces and underscores with hyphens
    .replace(/[^a-z0-9-]/g, '') // Remove any characters that aren't alphanumeric or hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens into one
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens

  return dirName || 'instant-app'; // Fall back to 'instant-app' if result is empty
}

type Framework = 'nextjs' | 'expo';

type Step = {
  id: string;
  title: string;
  description: string;
  command?: string;
  link?: string;
};

const frameworkConfig: Record<
  Framework,
  {
    flag: string;
    devCommand: string;
    viewStep: { type: 'link'; url: string } | { type: 'text'; text: string };
  }
> = {
  nextjs: {
    flag: '--next',
    devCommand: 'npm run dev',
    viewStep: { type: 'link', url: 'http://localhost:3000' },
  },
  expo: {
    flag: '--expo',
    devCommand: 'npx expo start',
    viewStep: {
      type: 'text',
      text: 'Scan the QR code in your terminal to open the app in Expo Go',
    },
  },
};

function getSteps(
  framework: Framework,
  dirName: string,
  appId: string,
): Step[] {
  const config = frameworkConfig[framework];
  const viewStep: Step =
    config.viewStep.type === 'link'
      ? {
        id: 'view_app',
        title: 'View your app',
        description: 'Open your browser to see the app running locally',
        link: config.viewStep.url,
      }
      : {
        id: 'view_app',
        title: 'View your app',
        description: config.viewStep.text,
      };

  return [
    {
      id: 'create_project',
      title: 'Create your project',
      description: `Scaffold a new ${framework === 'nextjs' ? 'Next.js' : 'Expo'} app with Instant pre-configured`,
      command: `npx create-instant-app ${dirName} --app ${appId} ${config.flag} --rules`,
    },
    {
      id: 'start_dev_server',
      title: 'Start the dev server',
      description: 'Navigate to your project and run the development server',
      command: `cd ${dirName} && ${config.devCommand}`,
    },
    viewStep,
  ];
}

export function AppStart({
  appId,
  appTitle,
}: {
  appId: string;
  appTitle: string;
}) {
  const posthog = usePostHog();
  const [framework, setFramework] = useState<Framework>('nextjs');
  const dirName = toDirectoryName(appTitle);
  const steps = getSteps(framework, dirName, appId);

  const trackCopy = (stepId: string) => {
    posthog.capture('start_guide_copy', {
      step: stepId,
      framework: framework === 'nextjs' ? 'web' : 'mobile',
      app_id: appId,
    });
  };

  return (
    <div>
      <SectionHeading>Getting Started</SectionHeading>
      <div className="flex flex-wrap items-center gap-1 pt-1">
        <span>Run these commands to create a new</span>
        <Select
          value={framework}
          options={[
            { label: 'web app', value: 'nextjs' as Framework },
            { label: 'mobile app', value: 'expo' as Framework },
          ]}
          onChange={(option) => option && setFramework(option.value)}
        />
        <span>with your credentials.</span>
      </div>

      <div className="mt-6 space-y-6">
        {steps.map((step, index) => (
          <div key={index} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-700 dark:bg-neutral-700 dark:text-neutral-300">
                {index + 1}
              </div>
              {index < steps.length - 1 && (
                <div className="mt-2 h-full w-px bg-gray-200 dark:bg-neutral-700" />
              )}
            </div>
            <div className="min-w-0 flex-1 pb-2">
              <SubsectionHeading>{step.title}</SubsectionHeading>
              <Content>
                <p className="mt-1 text-sm">{step.description}</p>
              </Content>
              {step.command && (
                <div className="mt-3">
                  <Copyable
                    value={step.command}
                    label="$"
                    onCopy={() => trackCopy(step.id)}
                  />
                </div>
              )}
              {step.link && (
                <div className="mt-3">
                  <a
                    href={step.link}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    {step.link}
                    <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                  </a>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Success message */}
      <div className="mt-6 border-t pt-6 dark:border-neutral-700">
        <div className="flex gap-4">
          <div className="flex flex-col items-center">
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-green-100 text-sm dark:bg-green-900/30">
              <span className="text-green-600 dark:text-green-400">✓</span>
            </div>
          </div>
          <div className="flex-1">
            <SubsectionHeading>Huzzah!</SubsectionHeading>
            <Content>
              <p className="mt-1 text-sm">
                You've got your Instant app running. Check out the Next Steps
                below to keep going!
              </p>
            </Content>
          </div>
        </div>
      </div>
    </div>
  );
}
