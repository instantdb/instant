import { init } from '@instantdb/react';
import { useEffect, useState } from 'react';

type InstantReactClient = ReturnType<typeof init>;
export const useStableDB = ({
  appId,
  apiURI,
  websocketURI,
  adminToken,
}: {
  appId: string;
  apiURI: string;
  websocketURI: string;
  adminToken?: string;
}) => {
  const [connection] = useState<InstantReactClient>(
    init({
      appId,
      apiURI,
      websocketURI,
      // @ts-ignore
      __adminToken: adminToken,
      disableValidation: true,
    }),
  );

  return connection;
};
