'use client';

import { id as generateId } from '@instantdb/react';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/lib/db';
import { useChat } from '@ai-sdk/react';
import { UserMenu } from '@/components/UserMenu';
import { toast } from 'sonner';

const starterPrompts = [
  'Build a time zone app for remote teams',
  'Create a habit tracker with weekly goals, reminders, and progress charts.',
  'Build a collaborative grocery list with categories and real-time edits.',
];

export default function Page() {
  const [input, setInput] = useState('');
  const router = useRouter();

  const [chatId] = useState(generateId);

  const { sendMessage } = useChat({
    id: chatId,
    generateId,
    onError: (e) => {
      toast.error(`Failed to generate app: ${e.message || 'Unknown error'}`);
    },
  });

  const { user } = db.useAuth();

  async function submit(prompt: string) {
    const t = prompt.trim();
    if (!t || !user) return;
    await db.transact(
      db.tx.chats[chatId]
        .create({
          createdAt: Date.now(),
        })
        .link({ owner: user.id }),
    );

    sendMessage({ text: prompt });

    router.push(`/chat/${chatId}`);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit(input);
    setInput('');
  }

  const userId = user?.id;
  const { data: historyData } = db.useQuery(
    userId
      ? {
          chats: {
            $: {
              where: { owner: userId },
              order: { createdAt: 'desc' },
              limit: 100,
            },
            messages: { $: { order: { createdAt: 'asc' } } },
          },
        }
      : null,
  );

  const history = historyData?.chats || [];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1280px] flex-col gap-4 px-4 py-5 md:px-7 md:py-8">
      <section className="panel paper-grid relative p-6 md:p-10">
        <div className="pointer-events-none absolute -top-12 -right-8 h-32 w-32 rounded-full bg-[color-mix(in_oklab,var(--accent)_40%,transparent)] blur-2xl" />
        <div className="flex items-start justify-between">
          <div>
            <p className="font-mono text-[10px] font-bold tracking-[0.3em] text-[var(--muted)]/70 uppercase">
              Next.js · Vercel AI SDK · Instant
            </p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight md:text-5xl">
              Instant Mini-App Builder
            </h1>
          </div>
          <UserMenu />
        </div>
      </section>

      <div className="flex flex-1 flex-col items-center justify-center py-12">
        <div className="w-full max-w-3xl space-y-12">
          <div className="text-center">
            <h2 className="text-4xl font-bold tracking-tight">
              What would you like to build?
            </h2>
            <p className="mt-3 text-lg text-[var(--muted)]">
              Describe your app and I'll generate it in one shot using
              InstantDB.
            </p>
          </div>

          <form
            className="panel overflow-hidden p-2 shadow-2xl transition-shadow hover:shadow-[var(--panel-shadow)]"
            onSubmit={onSubmit}
          >
            <div className="bg-white p-5">
              <textarea
                autoFocus
                className="min-h-[100px] w-full resize-none border-none bg-transparent text-lg leading-relaxed outline-none placeholder:text-[var(--muted)]/40"
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submit(input);
                  }
                }}
                placeholder="Build a mobile-friendly expense tracker with categories and recurring payments."
                value={input}
              />
              <div className="mt-4 flex items-center justify-between">
                <button
                  className="rounded-xl bg-[#1d4f59] px-6 py-2.5 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!input.trim() || !user}
                  type="submit"
                >
                  {!user ? 'Connecting...' : 'Generate App'}
                </button>
                <div className="font-mono text-[10px] font-medium tracking-wider text-[var(--muted)]/60">
                  Powered by{' '}
                  <span className="font-bold text-[var(--ink)]">InstantDB</span>
                </div>
              </div>
            </div>
          </form>

          <div className="space-y-6 pt-2">
            <div className="space-y-3">
              <h3 className="font-mono text-[10px] font-bold tracking-[0.2em] text-[var(--muted)]/60 uppercase">
                Example Prompts
              </h3>
              <div className="grid gap-2">
                {starterPrompts.map((p) => (
                  <button
                    key={p}
                    className="w-full rounded-xl border border-[var(--line)]/60 bg-white/50 px-5 py-3 text-left text-[14px] font-medium text-[var(--ink)] transition hover:border-[var(--accent)] hover:bg-white hover:shadow-sm"
                    onClick={() => submit(p)}
                    type="button"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {history.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-mono text-[10px] font-bold tracking-[0.2em] text-[var(--muted)]/60 uppercase">
                  Recent History
                </h3>
                <div className="flex flex-wrap gap-2">
                  {history.map((chat) => {
                    const firstMsg =
                      chat.messages?.[0]?.parts[0]?.text || 'Untitled Chat';
                    return (
                      <Link
                        key={chat.id}
                        href={`/chat/${chat.id}`}
                        className="rounded-lg border border-[var(--line)]/40 bg-white/20 px-3 py-1.5 text-[11px] font-medium text-[var(--muted)] transition hover:border-[var(--accent)] hover:bg-white hover:text-[var(--ink)]"
                        title={firstMsg}
                      >
                        {firstMsg.slice(0, 45)}
                        {firstMsg.length > 45 ? '...' : ''}
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
