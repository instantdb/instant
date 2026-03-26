'use client';

import { useState, useCallback, useRef } from 'react';
import MuxPlayer from '@mux/mux-player-react';
import { CopyToClipboardButton } from './CopyToClipboardButton';
import { HeroTitle, LandingButton, SectionSubtitle } from './typography';

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

          <div className="absolute top-0 right-0 -bottom-2 left-0 bg-black/50 transition-colors duration-300 group-hover:bg-black/50" />

          <div className="absolute inset-x-0 top-[13%] px-6 text-center sm:top-[14%] sm:px-10">
            <p className="font-mono text-xs tracking-[0.16em] text-white/85 sm:text-[13px]">
              instant in action
            </p>
            <p className="mx-auto mt-6 text-3xl leading-[1.2] font-semibold tracking-[-0.02em] text-white sm:text-5xl">
              Agents build realtime
              <br />
              Instagram in 12 minutes
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
          <HeroTitle>The best backend for AI-coded apps</HeroTitle>
          <SectionSubtitle>
            Give your AI a real backend. You get auth, permissions, storage,
            presence, and streams — everything you need to ship apps your users
            will love.
          </SectionSubtitle>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <div className="inline-flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-100 px-4 py-3 font-mono text-base sm:text-lg">
              <span className="text-orange-600">$</span>
              <span className="text-gray-700">npx create-instant-app</span>
              <CopyToClipboardButton text="npx create-instant-app" />
            </div>

            <span className="text-base text-gray-400">or</span>

            <LandingButton href="/dash">Sign up now</LandingButton>
          </div>

          <div className="mx-auto mt-10 max-w-[880px]">
            <VideoPlayer />
          </div>
        </div>
      </div>
    </section>
  );
}
