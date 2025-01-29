import '../styles/globals.css';
import type { AppProps } from 'next/app';
import config from '../config';

function MyApp({ Component, pageProps }: AppProps) {
  if (!config.appId) {
    return (
      <div className="space-y-2 p-10">
        <h1 className="text-xl font-bold">
          Welcome to the react-nextjs playground!
        </h1>
        <p>
          In order to use the playground, you need to set up a you `.env` file
        </p>
        <p>
          Take a look at the{' '}
          <a
            href="https://github.com/instantdb/instant/tree/main/client/sandbox/react-nextjs"
            className="text-blue-500 underline"
          >
            <code>sandbox/react-nextjs</code> README
          </a>{' '}
          to learn more
        </p>
      </div>
    );
  }
  return <Component {...pageProps} />;
}

export default MyApp;
