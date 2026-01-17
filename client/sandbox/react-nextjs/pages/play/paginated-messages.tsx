import { useState } from 'react';
import { id, i, InstantReactAbstractDatabase } from '@instantdb/react';
import EphemeralAppPage from '../../components/EphemeralAppPage';

const schema = i.schema({
  entities: {
    messages: i.entity({
      text: i.string(),
      createdAt: i.date().indexed(),
    }),
  },
});

const pageSize = 5;

type CursorPagination =
  | { first: number; after?: [string, string, any, number] }
  | { last: number; before?: [string, string, any, number] };

function Messages({ db }: { db: InstantReactAbstractDatabase<typeof schema> }) {
  const [page, setPage] = useState(1);
  const [inputValue, setInputValue] = useState('');
  const [cursors, setCursors] = useState<CursorPagination>({ first: pageSize });
  const [useCursors, setUseCursors] = useState(false);

  const { isLoading, error, data, pageInfo } = db.useQuery({
    messages: {
      $: useCursors
        ? {
            ...cursors,
            order: { createdAt: 'asc' },
          }
        : {
            limit: pageSize,
            offset: pageSize * (page - 1),
            order: { createdAt: 'asc' },
          },
    },
  });

  console.log('Page info:', pageInfo);
  const { hasNextPage, hasPreviousPage } = pageInfo?.messages || {};
  const messages = data?.messages || [];

  if (isLoading) return null;
  if (error) return <div>Error: {error.message}</div>;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      db.transact(
        db.tx.messages[id()].create({
          text: inputValue,
          createdAt: new Date().getTime(),
        }),
      );
      setInputValue('');
    }
  };

  const handleDelete = (messageId: string) => {
    db.transact(db.tx.messages[messageId].delete());
  };

  const loadNextPage = () => {
    if (useCursors) {
      const endCursor = pageInfo?.messages?.endCursor;
      if (endCursor) {
        setCursors({ after: endCursor, first: pageSize });
      }
    } else {
      setPage((prev) => prev + 1);
    }
  };

  const loadPreviousPage = () => {
    if (useCursors) {
      const startCursor = pageInfo?.messages?.startCursor;
      if (startCursor) {
        setCursors({
          before: startCursor,
          last: pageSize,
        });
      } else {
        // If there's no start cursor, we're at the beginning
        setCursors({ first: pageSize });
      }
    } else {
      setPage((prev) => Math.max(prev - 1, 1));
    }
  };

  const togglePaginationMode = () => {
    setUseCursors(!useCursors);
    // Reset pagination state
    setPage(1);
    setCursors({ first: pageSize });
  };

  const deleteAll = async () => {
    const { data } = await db.queryOnce({ messages: {} });
    if (data?.messages && data.messages.length > 0) {
      await db.transact(
        data.messages.map((m) => db.tx.messages[m.id].delete()),
      );
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-2xl p-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Paginated Messages</h1>
        <div className="flex gap-2">
          <button
            onClick={togglePaginationMode}
            className="rounded bg-blue-500 px-4 py-2 text-white transition-colors hover:bg-blue-600"
          >
            {useCursors ? 'Switch to Offset' : 'Switch to Cursor'}
          </button>
          <button
            onClick={deleteAll}
            className="px-4 py-2 text-red-600 transition-colors hover:text-red-800"
          >
            Delete All
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mb-8">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Write a message..."
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="rounded-lg bg-blue-500 px-6 py-2 text-white transition-colors hover:bg-blue-600"
          >
            Send
          </button>
        </div>
      </form>

      <div className="space-y-2">
        {messages.length === 0 ? (
          <p className="text-gray-500">No messages yet. Start typing!</p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className="flex items-center justify-between rounded-lg bg-gray-100 p-4"
            >
              <span>{message.text}</span>
              <button
                onClick={() => handleDelete(message.id)}
                className="text-2xl text-gray-500 transition-colors hover:text-red-500"
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>

      <div className="relative mt-8 flex items-center">
        <div className="flex-1">
          {hasPreviousPage && (
            <button
              onClick={loadPreviousPage}
              className="rounded-lg bg-gray-200 px-4 py-2 transition-colors hover:bg-gray-300"
            >
              Previous
            </button>
          )}
        </div>
        <span className="absolute left-1/2 -translate-x-1/2 transform text-gray-600">
          {useCursors ? 'Cursor-based' : `Page ${page}`}
        </span>
        <div className="flex flex-1 justify-end">
          {hasNextPage && (
            <button
              onClick={loadNextPage}
              className="rounded-lg bg-gray-200 px-4 py-2 transition-colors hover:bg-gray-300"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return <EphemeralAppPage schema={schema} Component={Messages} />;
}
