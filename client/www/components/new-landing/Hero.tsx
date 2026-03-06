'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import MuxPlayer from '@mux/mux-player-react';
import { Button } from './Button';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={copy}
      className="cursor-pointer text-gray-400 transition-colors hover:text-gray-600"
      title="Copy to clipboard"
    >
      {copied ? (
        <svg
          className="h-4 w-4 text-green-500"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m4.5 12.75 6 6 9-13.5"
          />
        </svg>
      ) : (
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"
          />
        </svg>
      )}
    </button>
  );
}

// Types
type Task = {
  text: string;
  shortText: string;
  done: boolean;
};

// Constants
const STORAGE_KEY = 'instant-demo-tasks';

const DEFAULT_TASKS: Task[] = [
  { text: 'Design new landing page', shortText: 'Design landing', done: true },
  { text: 'Ship by Friday', shortText: 'Ship Friday', done: false },
  { text: 'Celebrate with team', shortText: 'Celebrate', done: false },
];

// Icons
function CheckIcon({
  className,
  strokeWidth = 2,
}: {
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={strokeWidth}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m4.5 12.75 6 6 9-13.5"
      />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 18 18 6M6 6l12 12"
      />
    </svg>
  );
}

// Video Player with Mux Player
const PLAYBACK_ID = 'w17NAgfCBoFtqQi2snD2B7f901Ri5V5uVXepK7x74I0000';
const THUMBNAIL_URL = `https://image.mux.com/${PLAYBACK_ID}/thumbnail.jpg?width=1920`;

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function VideoPlayer() {
  const [isPlaying, setIsPlaying] = useState(false);
  const playerRef = useRef<any>(null);

  const handlePlay = useCallback(() => {
    setIsPlaying(true);
    // Start playback on the already-preloaded player
    const el = playerRef.current;
    if (el) {
      el.currentTime = 0;
      el.play();
    }
  }, []);

  return (
    <div className="relative overflow-hidden rounded-[2rem] shadow-[0_28px_90px_rgba(0,0,0,0.22)]">
      {/* MuxPlayer is always mounted for eager preloading, but hidden until play */}
      <div className={isPlaying ? '' : 'invisible absolute inset-0'}>
        <MuxPlayer
          ref={playerRef}
          playbackId={PLAYBACK_ID}
          accentColor="#ea580c"
          metadata={{ video_title: 'InstantDB Demo' }}
          preload="auto"
          minResolution="1080p"
          renditionOrder="desc"
          style={{ aspectRatio: '16/9', display: 'block' }}
        />
      </div>

      {!isPlaying && (
        <button
          onClick={handlePlay}
          className="group relative w-full cursor-pointer"
        >
          <img
            src={THUMBNAIL_URL}
            alt="Watch demo video"
            className="aspect-video w-full scale-[1.01] object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />

          <div className="absolute inset-0 bg-black/58 transition-colors duration-300 group-hover:bg-black/50" />

          <div className="absolute inset-x-0 top-[13%] px-6 text-center sm:top-[14%] sm:px-10">
            <p className="font-mono text-xs tracking-[0.16em] text-white/85 sm:text-[13px]">
              instant in action
            </p>
            <p className="mx-auto mt-6 text-9xl leading-[1.2] font-semibold tracking-[-0.02em] text-white sm:text-5xl">
              Agents build a realtime
              <br />
              instagram, in 12 minutes
            </p>
          </div>

          <div className="absolute top-[73%] left-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-600 shadow-[0_20px_48px_rgba(234,88,12,0.55)] transition-transform duration-300 group-hover:scale-110 sm:h-24 sm:w-24 lg:h-28 lg:w-28">
              <PlayIcon className="ml-1 h-8 w-8 text-white sm:h-10 sm:w-10 lg:h-12 lg:w-12" />
            </div>
          </div>
        </button>
      )}
    </div>
  );
}

// Main Hero component
export function Hero() {
  return (
    <section className="pt-28 pb-8 sm:pt-32 sm:pb-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="hero-stagger-1 text-9xl font-semibold sm:text-5xl">
            The best backend for vibe-coded apps
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-balance sm:text-xl">
            Give your AI a backend and build delightful, full-stack apps. Try it yourself, you can see Instant in action with one command.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <div className="inline-flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-100 px-4 py-3 font-mono text-base sm:text-lg">
              <span className="text-orange-600">$</span>
              <span className="text-gray-700">npx create-instant-app</span>
              <CopyButton text="npx create-instant-app" />
            </div>

            <Link href="/dash">
              <button className="inline-flex items-center justify-center rounded-lg bg-orange-600 px-6 py-3 text-base font-medium text-white transition-colors hover:bg-orange-700 sm:text-lg">
                Sign up now
              </button>
            </Link>
          </div>

          <div className="hero-stagger-3 mx-auto mt-10 max-w-[880px]">
            <VideoPlayer />
          </div>
        </div>
      </div>
    </section>
  );
}

// Before/After Visual Demo
function BeforeAfterVisual() {
  const [tasks, setTasks] = useState(DEFAULT_TASKS);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setTasks(JSON.parse(saved));
      } catch {
        // ignore invalid JSON
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }, [tasks]);

  const toggleTask = useCallback((index: number) => {
    setTasks((prev) =>
      prev.map((task, i) =>
        i === index ? { ...task, done: !task.done } : task,
      ),
    );
  }, []);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-12 text-center">
        <h2 className="text-3xl font-semibold sm:text-6xl">
          Make your app real
        </h2>
        <p className="mx-auto mt-6 max-w-xl">
          AI can build you an app in seconds. But without a database, any data
          you create is never really saved.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:gap-10">
        {/* Without a database */}
        <div className="flex flex-col">
          <div className="mb-4 text-center text-sm font-medium tracking-wide text-gray-700 uppercase">
            Without a database
          </div>

          <div className="relative">
            <BrowserFrame>
              <MiniAppEmpty />
            </BrowserFrame>

            <div className="absolute -right-4 -bottom-4 w-24 sm:w-28">
              <PhoneFrame>
                <MiniAppMobile tasks={DEFAULT_TASKS} />
              </PhoneFrame>
            </div>

            <div className="absolute -top-2 -right-2 flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-red-100 shadow-sm">
              <XIcon className="h-5 w-5 text-red-500" />
            </div>
          </div>

          <div className="mt-6 text-center">
            <p className="font-medium">Your data is never really saved</p>
            <p className="mt-1 text-sm text-gray-500">
              Create data on one device. It's gone on another.
            </p>
          </div>
        </div>

        {/* With Instant */}
        <div className="flex flex-col">
          <div className="mb-4 text-center text-sm font-medium tracking-wide text-orange-600 uppercase">
            With Instant
          </div>

          <div className="relative">
            <BrowserFrame>
              <MiniAppInteractive tasks={tasks} onToggle={toggleTask} />
            </BrowserFrame>

            <div className="absolute -right-4 -bottom-4 w-24 sm:w-28">
              <PhoneFrame>
                <MiniAppMobile tasks={tasks} onToggle={toggleTask} />
              </PhoneFrame>
            </div>

            <div className="absolute -top-2 -right-2 flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-green-100 shadow-sm">
              <CheckIcon className="h-5 w-5 text-green-600" />
            </div>
          </div>

          <div className="mt-6 text-center">
            <p className="font-medium">Synced everywhere, instantly</p>
            <p className="mt-1 text-sm text-gray-500">
              Any device. Any time. Always up to date.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Device Frames
function BrowserFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
      <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-3">
        <div className="flex gap-1.5">
          <div className="h-3 w-3 rounded-full bg-red-400" />
          <div className="h-3 w-3 rounded-full bg-yellow-400" />
          <div className="h-3 w-3 rounded-full bg-green-400" />
        </div>
        <div className="mx-4 h-6 flex-1 rounded-md bg-gray-100" />
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border-4 border-gray-800 bg-white shadow-xl">
      <div className="flex h-4 items-end justify-center bg-gray-800 pb-1">
        <div className="h-1.5 w-12 rounded-full bg-gray-700" />
      </div>
      <div className="bg-white p-2">{children}</div>
    </div>
  );
}

// Mini App Components
function MiniAppEmpty() {
  return (
    <div className="space-y-1">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-300">My Tasks</div>
        <div className="text-xs text-gray-200">0 items</div>
      </div>
      <div className="flex min-h-[132px] items-center justify-center">
        <div className="text-sm font-medium text-gray-300">
          Nothing here yet
        </div>
      </div>
    </div>
  );
}

function MiniAppInteractive({
  tasks,
  onToggle,
}: {
  tasks: Task[];
  onToggle: (index: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold">My Tasks</div>
        <div className="text-xs text-gray-400">{tasks.length} items</div>
      </div>
      <div className="min-h-[132px] space-y-2">
        {tasks.map((task, i) => (
          <button
            key={i}
            onClick={() => onToggle(i)}
            className="flex w-full cursor-pointer items-center gap-2 rounded-lg bg-gray-50 p-2 text-left transition-colors hover:bg-gray-100"
          >
            <Checkbox checked={task.done} />
            <span
              className={`text-sm transition-colors ${task.done ? 'text-gray-400 line-through' : 'text-gray-700'}`}
            >
              {task.text}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MiniAppMobile({
  tasks,
  onToggle,
}: {
  tasks: Task[];
  onToggle?: (index: number) => void;
}) {
  return (
    <div className="space-y-0.5">
      <div className="mb-1 text-[8px] font-semibold">My Tasks</div>
      {tasks.map((task, i) => (
        <button
          key={i}
          onClick={() => onToggle?.(i)}
          className={`flex w-full items-center gap-1 rounded bg-gray-50 p-1 text-left transition-colors ${onToggle ? 'cursor-pointer hover:bg-gray-100' : ''}`}
        >
          <Checkbox checked={task.done} size="sm" />
          <span
            className={`text-[6px] transition-colors ${task.done ? 'text-gray-400 line-through' : 'text-gray-700'}`}
          >
            {task.shortText}
          </span>
        </button>
      ))}
    </div>
  );
}

// Shared checkbox component
function Checkbox({
  checked,
  size = 'md',
}: {
  checked: boolean;
  size?: 'sm' | 'md';
}) {
  const sizeClasses = size === 'sm' ? 'w-2 h-2 rounded-sm' : 'w-4 h-4 rounded';
  const iconSize = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2.5 h-2.5';
  const strokeWidth = size === 'sm' ? 4 : 3;

  return (
    <div
      className={`${sizeClasses} flex items-center justify-center border-2 transition-colors ${checked ? 'border-orange-500 bg-orange-500' : 'border-gray-300'}`}
    >
      {checked && (
        <CheckIcon
          className={`${iconSize} text-white`}
          strokeWidth={strokeWidth}
        />
      )}
    </div>
  );
}
