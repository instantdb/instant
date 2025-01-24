import { InstantApp } from '@/lib/types';
import { Button, cn } from '@/components/ui';
import { useRouter } from 'next/router';

export function StorageTab({
  className,
  app,
  isEnabled,
}: {
  className?: string;
  app: InstantApp;
  isEnabled?: boolean;
}) {
  const router = useRouter();
  return (
    <div className={cn('flex-1 flex flex-col', className)}>
      <div className="flex-1 flex flex-col items-center justify-center">
        <h2 className="text-center text-xl font-medium text-gray-900">
          {isEnabled
            ? "✈️ Storage has moved!"
            : "Storage is not enabled for this app yet!"
          }
        </h2>
        <p className="mt-2 text-center text-base text-gray-500 max-w-lg">
          {isEnabled
            ? "Storage files are now visible in the `$files` namespace on the explorer."
            : "We're working on making storage just right, and can't wait to share it with you. Are you interested in trying it out early?"
          }
        </p>
        {isEnabled
          ?
          <Button className="mt-6" size="large"
            onClick={() => {
              router.push({
                query: {
                  ...router.query,
                  t: 'explorer',
                  ns: '$files'
                }
              })
            }}>
            Go to $files namespace
          </Button>
          :
          <>
            <a
              href={`https://docs.google.com/forms/d/e/1FAIpQLSdzInffrNrsYaamtH_BUe917EOpcOq2k8RWcGM19XepJR6ivQ/viewform?usp=pp_url&entry.317753524=${app.id}`}
              target="_blank"
              rel="noopener noreferer"
            >
              <Button className="mt-6" size="large">
                Request beta access
              </Button>
            </a>
          </>
        }
      </div>
    </div>
  );
}
