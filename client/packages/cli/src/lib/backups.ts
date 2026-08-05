import { BackupsManager } from '@instantdb/platform';
import { version } from '@instantdb/version';
import { Effect } from 'effect';

import { AuthToken } from '../context/authToken.ts';
import { CurrentApp } from '../context/currentApp.ts';
import { getBaseUrl } from './http.ts';
import { decodeNodeBackupBody } from './decodeBackupBody.ts';

export const buildBackupsManager = (command: 'list' | 'download') =>
  Effect.gen(function* () {
    const apiURI = yield* getBaseUrl;
    const authToken = yield* AuthToken;
    const token = yield* authToken.getAuthToken;
    const { appId } = yield* CurrentApp;
    return {
      appId,
      manager: new BackupsManager({
        apiURI,
        token,
        headers: {
          'X-Instant-Source': 'instant-cli',
          'X-Instant-Version': version,
          'X-Instant-Command': `backup ${command}`,
        },
        decodeBackupBody: decodeNodeBackupBody,
      }),
    };
  });
