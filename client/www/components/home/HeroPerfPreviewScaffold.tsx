'use client';

import { MainNav } from '@/components/marketingUi';
import MuxPlayer from '@mux/mux-player-react';
import Link from 'next/link';
import { useCallback, useRef, useState } from 'react';

const PLAYBACK_ID = 'w17NAgfCBoFtqQi2snD2B7f901Ri5V5uVXepK7x74I0000';
const THUMBNAIL_URL = `https://image.mux.com/${PLAYBACK_ID}/thumbnail.jpg?width=1920`;

type HeroPerfPreviewScaffoldProps = {
  activeHref: string;
  badge: string;
  description: string;
  Background: React.ComponentType;
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <button
      onClick={copy}
      className="cursor-pointer text-gray-400 transition-colors hover:text-gray-600"
      title="Copy to clipboard"
      type="button"
    >
      {copied ? (
        <svg
          className="h-4 w-4 text-green-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
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
          stroke="currentColor"
          strokeWidth={1.5}
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
    const player = playerRef.current;
    if (!player) return;
    player.currentTime = 0;
    player.play();
  }, []);

  return (
    <div className="relative overflow-hidden rounded-[2rem] shadow-[0_28px_90px_rgba(0,0,0,0.22)]">
      <div className={isPlaying ? '' : 'invisible absolute inset-0'}>
        <MuxPlayer
          ref={playerRef}
          accentColor="#ea580c"
          metadata={{ video_title: 'InstantDB Demo' }}
          minResolution="1080p"
          playbackId={PLAYBACK_ID}
          preload="auto"
          renditionOrder="desc"
          style={{ aspectRatio: '16/9', display: 'block' }}
        />
      </div>

      {!isPlaying && (
        <button
          className="group relative w-full cursor-pointer"
          onClick={handlePlay}
          type="button"
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

function CompareLink({
  href,
  isActive,
  label,
}: {
  href: string;
  isActive: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 transition-colors ${
        isActive
          ? 'border-orange-200 bg-orange-50 text-orange-700'
          : 'border-gray-200 bg-white/90 text-gray-500 hover:text-gray-700'
      }`}
    >
      {label}
    </Link>
  );
}

export function HeroPerfPreviewScaffold({
  activeHref,
  badge,
  description,
  Background,
}: HeroPerfPreviewScaffoldProps) {
  return (
    <div className="text-off-black relative min-h-screen bg-[#F8F8F8]">
      <MainNav transparent />
      <main className="flex-1">
        <section className="relative overflow-hidden bg-[#F8F8F8]">
          <Background />
          <div className="relative z-10 pt-10 pb-8 sm:pt-16 sm:pb-12">
            <section className="pt-28 pb-8 sm:pt-32 sm:pb-12">
              <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="text-center">
                  <div className="mb-5 flex flex-wrap items-center justify-center gap-2 text-xs font-medium tracking-[0.16em] uppercase">
                    <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-orange-700">
                      {badge}
                    </span>
                    <CompareLink
                      href="/"
                      isActive={activeHref === '/'}
                      label="Original Home"
                    />
                    <CompareLink
                      href="/home/hero-bg-capped"
                      isActive={activeHref === '/home/hero-bg-capped'}
                      label="Capped Redraw"
                    />
                    <CompareLink
                      href="/home/hero-bg-layered"
                      isActive={activeHref === '/home/hero-bg-layered'}
                      label="Layered Trails"
                    />
                  </div>

                  <h1 className="hero-stagger-1 text-9xl font-semibold sm:text-5xl">
                    The best backend for AI-coded apps
                  </h1>
                  <p className="mx-auto mt-6 max-w-2xl text-lg text-balance sm:text-xl">
                    Give your AI a backend and build delightful, full-stack
                    apps. Try it yourself, you can see Instant in action with
                    one command.
                  </p>
                  <p className="mx-auto mt-3 max-w-3xl text-sm text-balance text-gray-500 sm:text-base">
                    {description}
                  </p>

                  <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
                    <div className="inline-flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-100 px-4 py-3 font-mono text-base sm:text-lg">
                      <span className="text-orange-600">$</span>
                      <span className="text-gray-700">
                        npx create-instant-app
                      </span>
                      <CopyButton text="npx create-instant-app" />
                    </div>

                    <span className="text-base text-gray-400">or</span>

                    <Link href="/dash">
                      <button
                        className="inline-flex items-center justify-center rounded-lg bg-orange-600 px-6 py-3 text-base font-medium text-white transition-colors hover:bg-orange-700 sm:text-lg"
                        type="button"
                      >
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
          </div>
          <div className="pointer-events-none absolute right-0 bottom-0 left-0 z-[5] h-48 bg-gradient-to-b from-transparent to-white" />
        </section>
      </main>
    </div>
  );
}
