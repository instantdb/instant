'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  i,
  id,
  init,
  InstantReactWebDatabase,
  InstaQLEntity,
} from '@instantdb/react';
import { asClientOnlyPage, useReadyRouter } from '@/components/clientOnlyPage';

// ----------
// Schema

const schema = i.schema({
  entities: {
    $files: i.entity({
      path: i.string().unique().indexed(),
      url: i.string(),
    }),
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
    }),
    habits: i.entity({
      name: i.string(),
      emoji: i.string(),
      frequency: i.string(),
      targetCount: i.number(),
      createdAt: i.number().indexed(),
      species: i.string(),
    }),
    completions: i.entity({
      completedAt: i.number().indexed(),
      count: i.number(),
    }),
  },
  links: {
    habitOwner: {
      forward: { on: 'habits', has: 'one', label: 'owner', required: true },
      reverse: { on: '$users', has: 'many', label: 'habits' },
    },
    completionHabit: {
      forward: {
        on: 'completions',
        has: 'one',
        label: 'habit',
        required: true,
      },
      reverse: { on: 'habits', has: 'many', label: 'completions' },
    },
  },
});

// ----------------
// db

let db: InstantReactWebDatabase<typeof schema> = null as any;

type HabitWithCompletions = InstaQLEntity<
  typeof schema,
  'habits',
  { completions: {}; owner: {} }
>;

const SPECIES = ['dino', 'alien'] as const;
const DINO_EMOJIS = ['🦕', '🦖', '🦴'];
const ALIEN_EMOJIS = ['👽', '🛸', '👾'];
const FREQUENCIES = ['daily', 'weekly'] as const;

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading, error } = db.useAuth();

  if (isLoading) return null;
  if (error)
    return <div className="p-4 text-red-500">Auth error: {error.message}</div>;
  if (!user) return <Login />;

  return <>{children}</>;
}

function Login() {
  const [sentEmail, setSentEmail] = useState('');

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-purple-900 to-green-900">
      <div className="max-w-sm rounded-2xl border-2 border-green-400 bg-black/50 p-8">
        {!sentEmail ? (
          <EmailStep onSendEmail={setSentEmail} />
        ) : (
          <CodeStep sentEmail={sentEmail} />
        )}
      </div>
    </div>
  );
}

function EmailStep({ onSendEmail }: { onSendEmail: (email: string) => void }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const inputEl = inputRef.current!;
    const email = inputEl.value;
    onSendEmail(email);
    db.auth.sendMagicCode({ email }).catch((err) => {
      alert('Uh oh :' + err.body?.message);
      onSendEmail('');
    });
  };
  return (
    <form onSubmit={handleSubmit} className="flex flex-col space-y-4">
      <h2 className="text-center text-2xl font-bold text-green-400">
        🦕 Dino & Alien Habit Tracker 👽
      </h2>
      <p className="text-center text-green-300">
        Enter your email to join the intergalactic habit tracking mission!
      </p>
      <input
        ref={inputRef}
        type="email"
        className="rounded-lg border-2 border-green-400 bg-green-900/50 px-4 py-2 text-green-100 placeholder-green-600"
        placeholder="space-explorer@email.com"
        required
      />
      <button
        type="submit"
        className="rounded-lg border-2 border-green-400 bg-green-600 px-4 py-2 font-bold text-white hover:bg-green-700"
      >
        Launch Mission 🚀
      </button>
    </form>
  );
}

function CodeStep({ sentEmail }: { sentEmail: string }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const inputEl = inputRef.current!;
    const code = inputEl.value;
    db.auth.signInWithMagicCode({ email: sentEmail, code }).catch((err) => {
      inputEl.value = '';
      alert('Uh oh :' + err.body?.message);
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col space-y-4">
      <h2 className="text-center text-2xl font-bold text-green-400">
        Enter Access Code 🔐
      </h2>
      <p className="text-center text-green-300">
        We transmitted a code to{' '}
        <strong className="text-green-400">{sentEmail}</strong>
      </p>
      <input
        ref={inputRef}
        type="text"
        className="rounded-lg border-2 border-green-400 bg-green-900/50 px-4 py-2 text-green-100 placeholder-green-600"
        placeholder="123456"
        required
        autoFocus
      />
      <button
        type="submit"
        className="rounded-lg border-2 border-green-400 bg-green-600 px-4 py-2 font-bold text-white hover:bg-green-700"
      >
        Verify Code 👽
      </button>
    </form>
  );
}

function Main() {
  const { user } = db.useAuth();
  const [showForm, setShowForm] = useState(false);
  const [selectedHabit, setSelectedHabit] = useState<string | null>(null);

  const { data, isLoading } = db.useQuery({
    habits: {
      $: { where: { 'owner.id': user!.id } },
      completions: {
        $: { order: { completedAt: 'desc' } },
      },
      owner: {},
    },
  });

  const habits = data?.habits || [];

  const getStreak = (habit: HabitWithCompletions) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let streak = 0;
    let currentDate = new Date(today);

    const sortedCompletions = [...(habit.completions || [])].sort(
      (a, b) => b.completedAt - a.completedAt,
    );

    for (const completion of sortedCompletions) {
      const completionDate = new Date(completion.completedAt);
      completionDate.setHours(0, 0, 0, 0);

      if (habit.frequency === 'daily') {
        if (completionDate.getTime() === currentDate.getTime()) {
          streak++;
          currentDate.setDate(currentDate.getDate() - 1);
        } else {
          break;
        }
      } else {
        const weekDiff = Math.floor(
          (currentDate.getTime() - completionDate.getTime()) /
            (7 * 24 * 60 * 60 * 1000),
        );
        if (weekDiff === 0) {
          streak++;
          currentDate.setDate(currentDate.getDate() - 7);
        } else {
          break;
        }
      }
    }

    return streak;
  };

  const getTodayCompletion = (habit: HabitWithCompletions) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return habit.completions?.find(
      (c) =>
        c.completedAt >= today.getTime() && c.completedAt < tomorrow.getTime(),
    );
  };

  const getThisWeekCompletion = (habit: HabitWithCompletions) => {
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);

    return habit.completions?.find(
      (c) =>
        c.completedAt >= startOfWeek.getTime() &&
        c.completedAt < endOfWeek.getTime(),
    );
  };

  const getProgress = (habit: HabitWithCompletions) => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentCompletions =
      habit.completions?.filter((c) => c.completedAt > thirtyDaysAgo) || [];
    const expectedCount = habit.frequency === 'daily' ? 30 : 4;
    return Math.round((recentCompletions.length / expectedCount) * 100);
  };

  if (isLoading) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-900 to-green-900 p-4">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-4xl font-bold text-green-400">
            🦕 Galactic Habit Tracker 👽
          </h1>
          <button
            onClick={() => db.auth.signOut()}
            className="text-purple-300 hover:text-purple-100"
          >
            Exit Ship 🚀
          </button>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {habits.map((habit) => (
            <HabitCard
              key={habit.id}
              habit={habit}
              streak={getStreak(habit)}
              progress={getProgress(habit)}
              todayCompletion={
                habit.frequency === 'daily'
                  ? getTodayCompletion(habit)
                  : undefined
              }
              weekCompletion={
                habit.frequency === 'weekly'
                  ? getThisWeekCompletion(habit)
                  : undefined
              }
              onClick={() => setSelectedHabit(habit.id)}
            />
          ))}
          <button
            onClick={() => setShowForm(true)}
            className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-green-400 bg-black/50 p-8 transition-colors hover:bg-green-900/30"
          >
            <span className="mb-2 text-6xl">➕</span>
            <span className="font-bold text-green-400">New Mission</span>
          </button>
        </div>

        {showForm && (
          <HabitForm onClose={() => setShowForm(false)} userId={user!.id} />
        )}

        {selectedHabit && (
          <HabitDetails
            habitId={selectedHabit}
            onClose={() => setSelectedHabit(null)}
          />
        )}
      </div>
    </div>
  );
}

function HabitCard({
  habit,
  streak,
  progress,
  todayCompletion,
  weekCompletion,
  onClick,
}: {
  habit: HabitWithCompletions;
  streak: number;
  progress: number;
  todayCompletion?: any;
  weekCompletion?: any;
  onClick: () => void;
}) {
  const { user } = db.useAuth();
  const isCompleted =
    habit.frequency === 'daily' ? todayCompletion : weekCompletion;
  const currentCount = isCompleted?.count || 0;

  const handleComplete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentCount < habit.targetCount) {
      if (isCompleted) {
        db.transact(
          db.tx.completions[isCompleted.id].update({
            count: currentCount + 1,
          }),
        );
      } else {
        db.transact(
          db.tx.completions[id()]
            .update({
              completedAt: Date.now(),
              count: 1,
            })
            .link({ habit: habit.id }),
        );
      }
    }
  };

  const borderColor =
    habit.species === 'dino' ? 'border-orange-500' : 'border-purple-500';
  const bgColor =
    habit.species === 'dino' ? 'bg-orange-900/30' : 'bg-purple-900/30';

  return (
    <div
      onClick={onClick}
      className={`${bgColor} border-2 ${borderColor} cursor-pointer rounded-xl p-6 transition-transform hover:scale-105`}
    >
      <div className="mb-4 flex items-start justify-between">
        <div>
          <span className="mr-2 text-4xl">{habit.emoji}</span>
          <h3 className="inline text-xl font-bold text-white">{habit.name}</h3>
        </div>
        <span className="text-2xl">
          {habit.species === 'dino' ? '🦕' : '👽'}
        </span>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-gray-300">Streak</span>
          <span className="text-2xl font-bold text-yellow-400">
            {streak}{' '}
            {streak === 1
              ? 'day'
              : habit.frequency === 'daily'
                ? 'days'
                : 'weeks'}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-gray-300">Progress (30d)</span>
          <span className="font-bold text-green-400">{progress}%</span>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-gray-300">
              {habit.frequency === 'daily' ? 'Today' : 'This week'}
            </span>
            <span className="text-white">
              {currentCount}/{habit.targetCount}
            </span>
          </div>
          <div className="relative h-8 overflow-hidden rounded-full bg-black/50">
            <div
              className="absolute h-full bg-gradient-to-r from-green-500 to-green-400 transition-all"
              style={{ width: `${(currentCount / habit.targetCount) * 100}%` }}
            />
            <button
              onClick={handleComplete}
              disabled={currentCount >= habit.targetCount}
              className="relative flex h-full w-full items-center justify-center font-bold text-white hover:bg-white/10 disabled:cursor-not-allowed"
            >
              {currentCount >= habit.targetCount
                ? 'Complete! 🎉'
                : 'Complete +1'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function HabitForm({
  onClose,
  userId,
}: {
  onClose: () => void;
  userId: string;
}) {
  const [name, setName] = useState('');
  const [species, setSpecies] = useState<(typeof SPECIES)[number]>('dino');
  const [emoji, setEmoji] = useState('🦕');
  const [frequency, setFrequency] =
    useState<(typeof FREQUENCIES)[number]>('daily');
  const [targetCount, setTargetCount] = useState(1);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    db.transact(
      db.tx.habits[id()]
        .update({
          name,
          emoji,
          frequency,
          targetCount,
          species,
          createdAt: Date.now(),
        })
        .link({ owner: userId }),
    );
    onClose();
  };

  const availableEmojis = species === 'dino' ? DINO_EMOJIS : ALIEN_EMOJIS;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-4 rounded-xl border-2 border-green-400 bg-black/90 p-8"
      >
        <h2 className="mb-4 text-center text-2xl font-bold text-green-400">
          New Galactic Mission 🚀
        </h2>

        <div>
          <label className="mb-2 block text-green-300">Mission Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border-2 border-green-400 bg-green-900/50 px-4 py-2 text-white"
            placeholder="Exercise on Mars"
            required
          />
        </div>

        <div>
          <label className="mb-2 block text-green-300">Species</label>
          <div className="grid grid-cols-2 gap-4">
            {SPECIES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setSpecies(s);
                  setEmoji(s === 'dino' ? '🦕' : '👽');
                }}
                className={`rounded-lg border-2 px-4 py-2 ${
                  species === s
                    ? 'border-green-400 bg-green-600'
                    : 'border-gray-600 bg-black/50'
                } font-bold text-white`}
              >
                {s === 'dino' ? '🦕 Dinosaur' : '👽 Alien'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-2 block text-green-300">Mission Icon</label>
          <div className="grid grid-cols-3 gap-2">
            {availableEmojis.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                className={`rounded-lg border-2 py-2 text-3xl ${
                  emoji === e
                    ? 'border-green-400 bg-green-600'
                    : 'border-gray-600 bg-black/50'
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-2 block text-green-300">Frequency</label>
          <div className="grid grid-cols-2 gap-4">
            {FREQUENCIES.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFrequency(f)}
                className={`rounded-lg border-2 px-4 py-2 ${
                  frequency === f
                    ? 'border-green-400 bg-green-600'
                    : 'border-gray-600 bg-black/50'
                } font-bold text-white`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-2 block text-green-300">
            Target Count per {frequency === 'daily' ? 'Day' : 'Week'}
          </label>
          <input
            type="number"
            value={targetCount}
            onChange={(e) =>
              setTargetCount(Math.max(1, parseInt(e.target.value) || 1))
            }
            className="w-full rounded-lg border-2 border-green-400 bg-green-900/50 px-4 py-2 text-white"
            min="1"
            required
          />
        </div>

        <div className="flex gap-4 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg bg-gray-700 px-4 py-2 font-bold text-white hover:bg-gray-600"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 rounded-lg bg-green-600 px-4 py-2 font-bold text-white hover:bg-green-700"
          >
            Launch Mission 🚀
          </button>
        </div>
      </form>
    </div>
  );
}

function HabitDetails({
  habitId,
  onClose,
}: {
  habitId: string;
  onClose: () => void;
}) {
  const { data } = db.useQuery({
    habits: {
      $: { where: { id: habitId } },
      completions: {
        $: { order: { completedAt: 'desc' } },
      },
    },
  });

  const habit = data?.habits?.[0];

  if (!habit) return null;

  const getCalendarDays = () => {
    const today = new Date();
    const days = [];

    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);

      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const completion = habit.completions?.find(
        (c) =>
          c.completedAt >= date.getTime() && c.completedAt < nextDate.getTime(),
      );

      days.push({
        date,
        completion,
        isToday: i === 0,
      });
    }

    return days;
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this habit?')) {
      db.transact(db.tx.habits[habitId].delete());
      onClose();
    }
  };

  const borderColor =
    habit.species === 'dino' ? 'border-orange-500' : 'border-purple-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div
        className={`border-2 bg-black/90 ${borderColor} max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl p-8`}
      >
        <div className="mb-6 flex items-start justify-between">
          <div>
            <span className="mr-3 text-5xl">{habit.emoji}</span>
            <h2 className="inline text-3xl font-bold text-white">
              {habit.name}
            </h2>
            <span className="ml-3 text-3xl">
              {habit.species === 'dino' ? '🦕' : '👽'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-2xl text-gray-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="mb-8">
          <h3 className="mb-4 text-xl font-bold text-green-400">
            30-Day Calendar
          </h3>
          <div className="grid grid-cols-7 gap-2">
            {getCalendarDays().map(({ date, completion, isToday }, idx) => {
              const hasCompletion = completion && completion.count > 0;
              const isComplete = completion!.count >= habit.targetCount;

              return (
                <div
                  key={idx}
                  className={`flex aspect-square flex-col items-center justify-center rounded-lg text-xs ${
                    isToday ? 'ring-2 ring-green-400' : ''
                  } ${
                    isComplete
                      ? 'bg-green-600'
                      : hasCompletion
                        ? 'bg-yellow-600'
                        : 'bg-gray-800'
                  }`}
                >
                  <div className="font-bold">{date.getDate()}</div>
                  {completion && (
                    <div className="text-xs">
                      {completion.count}/{habit.targetCount}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded bg-green-600"></div>
              <span className="text-gray-400">Complete</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded bg-yellow-600"></div>
              <span className="text-gray-400">Partial</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded bg-gray-800"></div>
              <span className="text-gray-400">Missed</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleDelete}
            className="rounded-lg bg-red-600 px-4 py-2 font-bold text-white hover:bg-red-700"
          >
            Delete Habit 🗑️
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const router = useReadyRouter();
  const appId = router.query.a as string;
  const isLocal = router.query.localBackend === '1';
  if (!appId) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        You loaded this screen without an appId.
      </div>
    );
  }

  if (!db) {
    db = init({
      appId,
      schema,
      ...(isLocal
        ? {
            apiURI: 'http://localhost:8888',
            websocketURI: 'ws://localhost:8888/runtime/session',
          }
        : {}),
    });
  }

  return (
    <AuthGate>
      <Main />
    </AuthGate>
  );
}

export default asClientOnlyPage(App);
