import { UI } from 'instant-cli/ui';
import type { AppTokenResponse } from '../login.js';

export const printAppCreateResult = (result: AppTokenResponse | null) => {
  if (!result) {
    return;
  }

  if (result.approach === 'create') {
    UI.log(`Created new app with App ID: ${result.appId}`, UI.ciaModifier());
  }

  if (result.approach === 'ephemeral') {
    UI.log(
      `Created temporary app with App ID: ${result.appId}`,
      UI.ciaModifier(),
    );
  }
};
