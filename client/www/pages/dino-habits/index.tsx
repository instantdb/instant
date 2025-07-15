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
    <div className="flex justify-center items-center min-h-screen bg-gradient-to-b from-purple-900 to-green-900">
      <div className="max-w-sm bg-black/50 p-8 rounded-2xl border-2 border-green-400">
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
      <h2 className="text-2xl font-bold text-green-400 text-center">
        🦕 Dino & Alien Habit Tracker 👽
      </h2>
      <p className="text-green-300 text-center">
        Enter your email to join the intergalactic habit tracking mission!
      </p>
      <input
        ref={inputRef}
        type="email"
        className="bg-green-900/50 border-2 border-green-400 text-green-100 px-4 py-2 rounded-lg placeholder-green-600"
        placeholder="space-explorer@email.com"
        required
      />
      <button
        type="submit"
        className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg border-2 border-green-400"
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
      <h2 className="text-2xl font-bold text-green-400 text-center">
        Enter Access Code 🔐
      </h2>
      <p className="text-green-300 text-center">
        We transmitted a code to{' '}
        <strong className="text-green-400">{sentEmail}</strong>
      </p>
      <input
        ref={inputRef}
        type="text"
        className="bg-green-900/50 border-2 border-green-400 text-green-100 px-4 py-2 rounded-lg placeholder-green-600"
        placeholder="123456"
        required
        autoFocus
      />
      <button
        type="submit"
        className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg border-2 border-green-400"
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
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
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
            className="bg-black/50 border-2 border-dashed border-green-400 rounded-xl p-8 flex flex-col items-center justify-center hover:bg-green-900/30 transition-colors"
          >
            <span className="text-6xl mb-2">➕</span>
            <span className="text-green-400 font-bold">New Mission</span>
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
      className={`${bgColor} border-2 ${borderColor} rounded-xl p-6 cursor-pointer hover:scale-105 transition-transform`}
    >
      <div className="flex justify-between items-start mb-4">
        <div>
          <span className="text-4xl mr-2">{habit.emoji}</span>
          <h3 className="text-xl font-bold text-white inline">{habit.name}</h3>
        </div>
        <span className="text-2xl">
          {habit.species === 'dino' ? '🦕' : '👽'}
        </span>
      </div>

      <div className="space-y-3">
        <div className="flex justify-between items-center">
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

        <div className="flex justify-between items-center">
          <span className="text-gray-300">Progress (30d)</span>
          <span className="text-green-400 font-bold">{progress}%</span>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-gray-300">
              {habit.frequency === 'daily' ? 'Today' : 'This week'}
            </span>
            <span className="text-white">
              {currentCount}/{habit.targetCount}
            </span>
          </div>
          <div className="bg-black/50 rounded-full h-8 relative overflow-hidden">
            <div
              className="absolute h-full bg-gradient-to-r from-green-500 to-green-400 transition-all"
              style={{ width: `${(currentCount / habit.targetCount) * 100}%` }}
            />
            <button
              onClick={handleComplete}
              disabled={currentCount >= habit.targetCount}
              className="relative w-full h-full flex items-center justify-center text-white font-bold hover:bg-white/10 disabled:cursor-not-allowed"
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
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
      <form
        onSubmit={handleSubmit}
        className="bg-black/90 border-2 border-green-400 rounded-xl p-8 max-w-md w-full space-y-4"
      >
        <h2 className="text-2xl font-bold text-green-400 text-center mb-4">
          New Galactic Mission 🚀
        </h2>

        <div>
          <label className="text-green-300 block mb-2">Mission Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-green-900/50 border-2 border-green-400 text-white px-4 py-2 rounded-lg"
            placeholder="Exercise on Mars"
            required
          />
        </div>

        <div>
          <label className="text-green-300 block mb-2">Species</label>
          <div className="grid grid-cols-2 gap-4">
            {SPECIES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setSpecies(s);
                  setEmoji(s === 'dino' ? '🦕' : '👽');
                }}
                className={`py-2 px-4 rounded-lg border-2 ${
                  species === s
                    ? 'bg-green-600 border-green-400'
                    : 'bg-black/50 border-gray-600'
                } text-white font-bold`}
              >
                {s === 'dino' ? '🦕 Dinosaur' : '👽 Alien'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-green-300 block mb-2">Mission Icon</label>
          <div className="grid grid-cols-3 gap-2">
            {availableEmojis.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                className={`text-3xl py-2 rounded-lg border-2 ${
                  emoji === e
                    ? 'bg-green-600 border-green-400'
                    : 'bg-black/50 border-gray-600'
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-green-300 block mb-2">Frequency</label>
          <div className="grid grid-cols-2 gap-4">
            {FREQUENCIES.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFrequency(f)}
                className={`py-2 px-4 rounded-lg border-2 ${
                  frequency === f
                    ? 'bg-green-600 border-green-400'
                    : 'bg-black/50 border-gray-600'
                } text-white font-bold`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-green-300 block mb-2">
            Target Count per {frequency === 'daily' ? 'Day' : 'Week'}
          </label>
          <input
            type="number"
            value={targetCount}
            onChange={(e) =>
              setTargetCount(Math.max(1, parseInt(e.target.value) || 1))
            }
            className="w-full bg-green-900/50 border-2 border-green-400 text-white px-4 py-2 rounded-lg"
            min="1"
            required
          />
        </div>

        <div className="flex gap-4 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg"
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
        $: { order: { completedAt: 'desc' }, limit: 30 },
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
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
      <div
        className={`bg-black/90 border-2 ${borderColor} rounded-xl p-8 max-w-4xl w-full max-h-[90vh] overflow-y-auto`}
      >
        <div className="flex justify-between items-start mb-6">
          <div>
            <span className="text-5xl mr-3">{habit.emoji}</span>
            <h2 className="text-3xl font-bold text-white inline">
              {habit.name}
            </h2>
            <span className="text-3xl ml-3">
              {habit.species === 'dino' ? '🦕' : '👽'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl"
          >
            ✕
          </button>
        </div>

        <div className="mb-8">
          <h3 className="text-xl font-bold text-green-400 mb-4">
            30-Day Calendar
          </h3>
          <div className="grid grid-cols-7 gap-2">
            {getCalendarDays().map(({ date, completion, isToday }, idx) => {
              const hasCompletion = completion && completion.count > 0;
              const isComplete = completion!.count >= habit.targetCount;

              return (
                <div
                  key={idx}
                  className={`aspect-square rounded-lg flex flex-col items-center justify-center text-xs ${
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
          <div className="flex gap-4 mt-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-600 rounded"></div>
              <span className="text-gray-400">Complete</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-yellow-600 rounded"></div>
              <span className="text-gray-400">Partial</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-gray-800 rounded"></div>
              <span className="text-gray-400">Missed</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleDelete}
            className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg"
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
      <div className="flex justify-center items-center min-h-screen">
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
