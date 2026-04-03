import { init } from '@instantdb/react';
import { useMemo } from 'react';

type InstantReactClient = ReturnType<typeof init>;
export const useStableDB = ({
  appId,
  apiURI,
  websocketURI,
}: {
  appId: string;
  apiURI: string;
  websocketURI: string;
}) => {
  const connection = useMemo<InstantReactClient>(
    () =>
      init({
        appId,
        apiURI,
        websocketURI,
        disableValidation: true,
        devtool: false,
      }),
    [appId, apiURI, websocketURI],
  );

  return connection;
};
