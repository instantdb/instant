'use client';

import { useState, useEffect, useRef } from 'react';
import { AnimateIn } from './AnimateIn';
import { AutoPlayDemo } from './AutoPlayDemo';
import { RealtimeChecklistDemo } from './RealtimeChecklistDemo';
import { OfflineDemoReactions } from './OfflineDemoReactions';
import {
  FeatureBody,
  SectionIntro,
  SectionSubtitle,
  SectionTitle,
  Subheading,
} from './typography';

// Two devices showing real-time sync
function RealtimeSyncDemo() {
  const [messages, setMessages] = useState([
    { id: 1, user: 'Alice', text: 'Ready to ship?' },
    { id: 2, user: 'Bob', text: 'One sec, pushing now' },
  ]);
  const [showNew, setShowNew] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const cycle = () => {
      setShowNew(true);
      timerRef.current = setTimeout(() => {
        setShowNew(false);
        timerRef.current = setTimeout(cycle, 3000);
      }, 4000);
    };
    timerRef.current = setTimeout(cycle, 2000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const newMessage = { id: 3, user: 'Alice', text: 'Shipped! 🚀' };

  const DeviceFrame = ({ label }: { label: string }) => (
    <div className="min-w-0 flex-1">
      <div className="mb-1.5 text-center text-xs text-gray-400">{label}</div>
      <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
        <div className="space-y-2">
          {messages.map((m) => (
            <div key={m.id} className="flex gap-2">
              <span className="shrink-0 text-xs font-semibold">{m.user}</span>
              <span className="text-xs text-gray-600">{m.text}</span>
            </div>
          ))}
          <div
            className={`flex gap-2 transition-opacity duration-300 ${
              showNew ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <span className="shrink-0 text-xs font-semibold">
              {newMessage.user}
            </span>
            <span className="text-xs text-gray-600">{newMessage.text}</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
      <div className="flex gap-4">
        <DeviceFrame label="Laptop" />
        <div className="flex items-center">
          <SyncIcon className="h-5 w-5 text-gray-300" />
        </div>
        <DeviceFrame label="Phone" />
      </div>
      <p className="mt-3 text-center text-xs text-gray-400">
        Same data, every device, instantly
      </p>
    </div>
  );
}

// Offline mode visual
function OfflineDemo() {
  const [isOffline, setIsOffline] = useState(true);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const cycle = () => {
      setIsOffline(true);
      timerRef.current = setTimeout(() => {
        setIsOffline(false);
        timerRef.current = setTimeout(cycle, 4000);
      }, 4000);
    };
    cycle();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const events = isOffline
    ? [
        {
          icon: '✏️',
          text: 'Edited "Project plan"',
          time: 'just now',
          status: 'queued',
        },
        {
          icon: '✅',
          text: 'Completed 3 tasks',
          time: '2m ago',
          status: 'queued',
        },
        { icon: '💬', text: 'Added comment', time: '5m ago', status: 'queued' },
      ]
    : [
        {
          icon: '✏️',
          text: 'Edited "Project plan"',
          time: '1m ago',
          status: 'synced',
        },
        {
          icon: '✅',
          text: 'Completed 3 tasks',
          time: '3m ago',
          status: 'synced',
        },
        { icon: '💬', text: 'Added comment', time: '6m ago', status: 'synced' },
      ];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-medium">Activity</span>
        <span
          className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
            isOffline ? 'text-amber-600' : 'text-green-600'
          }`}
        >
          {isOffline ? (
            <>
              <WifiOffIcon className="h-3.5 w-3.5" />
              Offline
            </>
          ) : (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              Synced
            </>
          )}
        </span>
      </div>
      <div className="space-y-2">
        {events.map((e, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2.5"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-sm">{e.icon}</span>
              <span className="text-sm text-gray-700">{e.text}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">{e.time}</span>
              {e.status === 'queued' ? (
                <span className="text-xs font-medium text-amber-500">
                  queued
                </span>
              ) : (
                <svg
                  className="h-3.5 w-3.5 text-green-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m4.5 12.75 6 6 9-13.5"
                  />
                </svg>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-gray-400">
        {isOffline
          ? 'Changes queue while offline...'
          : 'Back online — everything synced!'}
      </p>
    </div>
  );
}

// Icons
function SyncIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
      />
    </svg>
  );
}

function WifiOffIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 3l18 18M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12 18.75h.008v.008H12v-.008Z"
      />
    </svg>
  );
}

export function SyncEngine() {
  return (
    <div className="space-y-16">
      {/* Section header */}
      <AnimateIn>
        <SectionIntro>
          <SectionTitle>A database in your frontend</SectionTitle>
          <SectionSubtitle>
            Instant apps aren't like traditional CRUD apps. Instead of endpoints
            your frontend gets a real-time database. This is the same tech that
            makes Linear and Figma so delightful.
          </SectionSubtitle>
        </SectionIntro>
      </AnimateIn>

      {/* Features */}
      <div className="flex flex-col gap-9">
        {/* Instant updates — text left, demo right */}
        <AnimateIn>
          <div className="flex grid-cols-3 flex-col items-center gap-6 md:grid">
            <div className="col-span-1">
              <Subheading>Instant updates</Subheading>
              <FeatureBody>
                Click a button, toggle a switch, type in a field — whatever you
                do, you see the result right away. Your apps feel fast, so your
                users stay in flow.
              </FeatureBody>
            </div>
            <div className="col-span-2 md:px-12 md:py-9">
              <AutoPlayDemo />
            </div>
          </div>
        </AnimateIn>

        {/* Real-time sync — demo left, text right */}
        <AnimateIn>
          <div className="grid grid-cols-3 items-center gap-6">
            <div className="col-span-2 px-12 py-9">
              <RealtimeChecklistDemo />
            </div>
            <div className="col-span-1">
              <Subheading>Real-time sync</Subheading>
              <FeatureBody>
                Multiplayer experiences work out of the box. If one person makes
                a change, everyone else can see it right away. No need to
                refresh or re-open the app to see the latest.
              </FeatureBody>
            </div>
          </div>
        </AnimateIn>

        {/* Works offline — text left, demo right */}
        <AnimateIn>
          <div className="grid grid-cols-3 items-center gap-6">
            <div className="col-span-1">
              <Subheading>Works offline</Subheading>
              <FeatureBody>
                Instant apps keep working when you lose connection. When your
                users get back online, everything syncs up without them having
                to do a thing. Pure magic.
              </FeatureBody>
            </div>
            <div className="col-span-2 px-12 py-9">
              <OfflineDemoReactions />
            </div>
          </div>
        </AnimateIn>
      </div>
    </div>
  );
}
