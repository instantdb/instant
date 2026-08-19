import { SunsetStage } from './types';

export function isFullSunsetStage(stage: SunsetStage | undefined) {
  return stage === 'read-only' || stage === 'disabled';
}
