import { Chat } from '@/components/Chat';
import { Sidebar } from '@/components/Sidebar';

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="mx-auto flex h-screen w-full max-w-5xl p-4">
      <div className="flex h-full w-full overflow-hidden rounded-lg border border-gray-200">
        <Sidebar />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Chat id={id} />
        </div>
      </div>
    </div>
  );
}
