import Json from '@uiw/react-json-view';

export function Data({
  data,
  collapsed,
}: {
  data: any;
  collapsed?: boolean | number;
}) {
  const isObject = typeof data === 'object' && data !== null;

  return (
    <div className="p-1 bg-white rounded">
      {isObject ? (
        <Json
          value={data}
          collapsed={collapsed}
          displayDataTypes={false}
          displayObjectSize={false}
          enableClipboard={false}
          indentWidth={2}
          style={{ fontSize: '0.675rem' }}
        />
      ) : (
        <pre style={{ fontSize: '0.675rem' }} className="overflow-x-auto">
          {JSON.stringify(data) ?? 'undefined'}
        </pre>
      )}
    </div>
  );
}
