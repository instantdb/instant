'use client';

import { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import MuxPlayer from '@mux/mux-player-react';

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
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  // Check for mobile only once on mount (don't update on resize to avoid issues with rotation)
  useEffect(() => {
    // Use touch capability as a more reliable mobile check
    const checkMobile =
      'ontouchstart' in window || navigator.maxTouchPoints > 0;
    setIsMobile(checkMobile);
  }, []);

  // Close on escape key and lock body scroll
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Don't render until we know if it's mobile or not (prevents flicker)
  if (isMobile === null) {
    return (
      <div className="aspect-video overflow-hidden rounded-xl bg-gray-900 shadow-2xl" />
    );
  }

  // On mobile/touch devices, show Mux Player directly for native fullscreen
  if (isMobile) {
    return (
      <div className="overflow-hidden rounded-xl shadow-2xl">
        <MuxPlayer
          playbackId={PLAYBACK_ID}
          accentColor="#ea580c"
          metadata={{ video_title: 'InstantDB Demo' }}
          style={{ aspectRatio: '16/9', display: 'block' }}
        />
      </div>
    );
  }

  // On desktop, show thumbnail that opens modal
  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="group relative w-full cursor-pointer overflow-hidden rounded-xl shadow-2xl"
      >
        <img
          src={THUMBNAIL_URL}
          alt="Watch demo video"
          className="aspect-video w-full object-cover"
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/30">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/90 shadow-lg transition-all group-hover:scale-110 group-hover:bg-white">
            <PlayIcon className="ml-1 h-10 w-10 text-orange-600" />
          </div>
        </div>
      </button>

      {/* Lightbox modal — portaled to body to escape transformed ancestors */}
      {createPortal(
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center p-8 transition-all duration-500 ease-out ${
            isOpen
              ? 'pointer-events-auto opacity-100'
              : 'pointer-events-none opacity-0'
          }`}
          onClick={() => setIsOpen(false)}
        >
          <div
            className={`absolute inset-0 bg-black/90 transition-opacity duration-500 ease-out ${isOpen ? 'opacity-100' : 'opacity-0'}`}
          />

          <button
            onClick={() => setIsOpen(false)}
            className={`absolute top-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition-all duration-500 ease-out hover:bg-white/20 ${
              isOpen ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0'
            }`}
          >
            <XIcon className="h-6 w-6 text-white" />
          </button>

          <div
            className={`relative w-full max-w-6xl overflow-hidden rounded-xl shadow-2xl transition-all duration-500 ease-out ${
              isOpen ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {isOpen && (
              <MuxPlayer
                playbackId={PLAYBACK_ID}
                accentColor="#ea580c"
                metadata={{ video_title: 'InstantDB Demo' }}
                style={{ aspectRatio: '16/9', display: 'block' }}
              />
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// Main Hero component
export function Hero() {
  return (
    <section className="pt-20 pb-16 sm:pb-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="hero-stagger-1 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Give your AI a database
          </h1>
          <p className="hero-stagger-2 mx-auto mt-6 max-w-2xl text-lg text-balance text-gray-500 sm:text-xl">
            Without a database, your app is just a demo. Add Instant and your
            app becomes real — users can signup, create content, and{' '}
            <span className="brush-underline inline-block text-3xl font-semibold text-orange-600 italic sm:text-3xl">
              feel delight
            </span>
            .
          </p>

          <div className="hero-stagger-3 mx-auto mt-10 max-w-3xl">
            <VideoPlayer />
          </div>
        </div>

        <div className="mt-20">
          <BeforeAfterVisual />
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
        <h2 className="text-3xl font-semibold tracking-tight sm:text-6xl">
          Make your app real
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-gray-500">
          AI can build you an app in seconds. But without a database, any data
          you create is never really saved.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:gap-10">
        {/* Without a database */}
        <div className="flex flex-col">
          <div className="mb-4 text-center text-sm font-medium tracking-wide text-gray-400 uppercase">
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
