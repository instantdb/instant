import React from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { init } from '@instantdb/react';

import Login from '../../components/Login';
import config from '../../config';

const App = ({ appId }: { appId?: string }) => {
  const db = init({
    ...config,
    appId: appId || config.appId,
  });

  const { isLoading, error, user } = db.useAuth();
  if (isLoading) {
    return <div>Loading...</div>;
  }
  if (error) {
    return <div>Uh oh! {error.message}</div>;
  }
  if (!user) {
    return <Login auth={db.auth} />;
  }

  return <Main db={db} />;
};

function Main({ db }: { db: any }) {
  const [files, setFiles] = React.useState<File[]>([]);
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);
  const [imageStatus, setImageStatus] = React.useState<
    'pending' | 'success' | 'error'
  >('pending');

  const handleTryDownloadUrl = async () => {
    if (files.length === 0) return;

    const [file] = files;
    const { name: fileName, type: fileType } = file;

    if (!fileType.startsWith('image/')) {
      return;
    }

    try {
      const url = await db.storage.getDownloadUrl(fileName);
      console.log('Download URL:', url);
      setImageUrl(url);
      setImageStatus('pending');
    } catch (error) {
      console.error('Error downloading file:', error);
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    const [file] = files;
    const { name: fileName, type: fileType } = file;

    try {
      await db.storage.upload(fileName, file);
      const url = await db.storage.getDownloadUrl(fileName);
      console.log('Download URL:', url);
      if (fileType.startsWith('image/')) {
        setImageUrl(url);
        setImageStatus('pending');
      }
    } catch (error) {
      console.error('Error uploading file:', error);
    }
  };

  const handleDelete = async () => {
    if (files.length === 0) return;

    const [file] = files;
    const { name: fileName } = file;

    if (!confirm(`Are you sure you want to delete ${fileName}?`)) {
      return;
    }

    try {
      await db.storage.delete(fileName);
      setImageUrl(null);
      setImageStatus('pending');
    } catch (error) {
      console.error('Error deleting file:', error);
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-1 flex-col bg-white text-zinc-900">
      <main className="flex flex-1 flex-col">
        <section className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 pb-24 pt-32 sm:px-8 sm:pb-32 sm:pt-40 md:pb-40 md:pt-40">
          <div className="">
            <h1 className="mb-4 text-4xl font-bold">Upload demo</h1>

            <div className="flex max-w-md flex-col items-center gap-1">
              <input
                type="file"
                className="flex h-9 w-full rounded-md border border-zinc-200 bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:text-sm placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
                onChange={(e: React.ChangeEvent<any>) =>
                  setFiles(e.target.files)
                }
              />
              <div className="w-full flex gap-1 items-center">
                <button
                  className="flex-1 inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 disabled:pointer-events-none disabled:opacity-50 bg-zinc-100 text-zinc-900 shadow-sm hover:bg-zinc-100/80 h-9 px-4 py-2"
                  onClick={handleTryDownloadUrl}
                >
                  Check
                </button>
                <button
                  className="flex-1 inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 disabled:pointer-events-none disabled:opacity-50 bg-zinc-900 text-zinc-50 shadow hover:bg-zinc-900/90 h-9 px-4 py-2"
                  onClick={handleUpload}
                >
                  Upload
                </button>
              </div>

              {!!imageUrl && (
                <div className="w-full">
                  {imageStatus !== 'error' && (
                    <img
                      src={imageUrl}
                      onError={() => setImageStatus('error')}
                      onLoad={() => setImageStatus('success')}
                      className="mt-4 w-full rounded-md"
                    />
                  )}
                  {imageStatus === 'success' && (
                    <button
                      className="w-full items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-700 disabled:pointer-events-none disabled:opacity-50 bg-red-600 text-red-50 shadow hover:bg-red-600/90 h-9 px-4 py-2"
                      onClick={handleDelete}
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function Page() {
  const router = useRouter();
  const [ready, setReady] = React.useState<boolean>(false);
  const [appId, setAppId] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    if (!router.isReady) {
      return;
    }

    const appId = router.query.appId as string;

    if (appId) {
      setAppId(appId);
    }
    setReady(true);
  }, [router.isReady]);

  return (
    <div>
      <Head>
        <title>Instant Example App: Storage</title>
        <meta
          name="description"
          content="Relational Database, on the client."
        />
      </Head>
      {ready && <App appId={appId} />}
    </div>
  );
}

export default Page;
