import { useState } from 'react';
import { id, i, InstantReactAbstractDatabase, Cursor } from '@instantdb/react';
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
  | { first: number; after?: Cursor }
  | { last: number; before?: Cursor };

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
    <div className="min-h-screen p-8 max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">Paginated Messages</h1>
        <div className="flex gap-2">
          <button
            onClick={togglePaginationMode}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            {useCursors ? 'Switch to Offset' : 'Switch to Cursor'}
          </button>
          <button
            onClick={deleteAll}
            className="px-4 py-2 text-red-600 hover:text-red-800 transition-colors"
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
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
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
              className="p-4 bg-gray-100 rounded-lg flex justify-between items-center"
            >
              <span>{message.text}</span>
              <button
                onClick={() => handleDelete(message.id)}
                className="text-gray-500 hover:text-red-500 transition-colors text-2xl"
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>

      <div className="relative flex items-center mt-8">
        <div className="flex-1">
          {hasPreviousPage && (
            <button
              onClick={loadPreviousPage}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors"
            >
              Previous
            </button>
          )}
        </div>
        <span className="text-gray-600 absolute left-1/2 transform -translate-x-1/2">
          {useCursors ? 'Cursor-based' : `Page ${page}`}
        </span>
        <div className="flex-1 flex justify-end">
          {hasNextPage && (
            <button
              onClick={loadNextPage}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors"
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
