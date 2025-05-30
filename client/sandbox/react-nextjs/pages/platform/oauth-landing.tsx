import { OAuthHandler } from '@instantdb/platform';
import { OAUTH_HANDLER, ClientIdReadme } from '../play/platform-sdk-demo';
import { useEffect, useState } from 'react';

function Demo({ oauthHandler }: { oauthHandler: OAuthHandler }) {
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    try {
      return oauthHandler.handleClientRedirect();
    } catch (e) {
      setError(e as Error);
    }
  }, []);

  if (error) {
    return (
      <div>
        <p>Error</p>
        <p>{error.message}</p>
      </div>
    );
  }
  return <div>Loading...</div>;
}

export default function Page() {
  const oauthHandler = OAUTH_HANDLER;
  return (
    <div className="max-w-lg flex flex-col mt-20 mx-auto">
      {!oauthHandler ? (
        <ClientIdReadme />
      ) : (
        <Demo oauthHandler={oauthHandler} />
      )}
    </div>
  );
}
