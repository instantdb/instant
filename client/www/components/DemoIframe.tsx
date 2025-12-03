import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';

export function DemoIframe(props: { uri: string }) {
  const { uri } = props;
  return (
    <div className="pointer-events-none" style={{ height: '750px' }}>
      <div className="not-prose pointer-events-auto absolute right-0 left-0 p-4">
        <div className="mx-auto max-w-4xl">
          <div className="space-y-2">
            <div
              className="flex flex-col rounded-lg border border-gray-200 p-2"
              style={{
                minHeight: '750px',
                maxHeight: '750px',
              }}
            >
              <div>
                <div className="flex items-center justify-between rounded-lg bg-gray-200 p-2 text-black">
                  <div className="truncate text-xs">{uri}</div>
                  <a href={uri} target="_blank">
                    <ArrowTopRightOnSquareIcon className="h-4 w-4 text-gray-500" />
                  </a>
                </div>
              </div>
              <iframe src={uri} className="h-full w-full flex-1" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
