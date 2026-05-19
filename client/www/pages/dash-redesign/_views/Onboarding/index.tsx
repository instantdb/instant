export { Current as OnboardingView } from './Current';

export type OnboardingStage = 'welcome' | 'profile' | 'create-app';

export const ONBOARDING_STAGES: { key: OnboardingStage; label: string }[] = [
  { key: 'welcome', label: 'Welcome' },
  { key: 'profile', label: 'Tell us about yourself' },
  { key: 'create-app', label: 'Name your app' },
];
