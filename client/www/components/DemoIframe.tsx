import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';

export function DemoIframe(props: { uri: string }) {
  const { uri } = props;
  return (
    <div className="pointer-events-none" style={{ height: '750px' }}>
      <div className="not-prose absolute left-0 right-0 p-4 pointer-events-auto">
        <div className="max-w-4xl mx-auto">
          <div className="space-y-2">
            <div
              className="border border-gray-200 rounded-lg p-2 flex flex-col"
              style={{
                minHeight: '750px',
                maxHeight: '750px',
              }}
            >
              <div>
                <div className="text-black p-2 rounded-lg bg-gray-200 flex justify-between items-center">
                  <div className="text-xs truncate">{uri}</div>
                  <a href={uri} target="_blank">
                    <ArrowTopRightOnSquareIcon className="h-4 w-4 text-gray-500" />
                  </a>
                </div>
              </div>
              <iframe src={uri} className="w-full h-full flex-1" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
