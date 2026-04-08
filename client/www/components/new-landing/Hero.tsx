'use client';

import { useState, useCallback, useRef } from 'react';
import MuxPlayer from '@mux/mux-player-react';
import { CopyToClipboardButton } from './CopyToClipboardButton';
import { HeroTitle, LandingButton, SectionSubtitle } from './typography';

// Video Player with Mux Player
const PLAYBACK_ID = 'Hn5WaLtZdNS3phDS42IW3tT02fNeluQqZyVHEyldC007s';
const THUMBNAIL_URL = '/video-previews/preview-4m41s.jpg';

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function VideoPlayer() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const playerRef = useRef<any>(null);

  const handlePlay = useCallback(() => {
    const el = playerRef.current;
    if (el) {
      el.currentTime = 0;
      el.play();
    }
  }, []);

  return (
    <div className="relative aspect-video overflow-hidden rounded-4xl shadow-[0_28px_90px_rgba(0,0,0,0.22)]">
      <div className={hasStarted ? '' : 'invisible absolute inset-0'}>
        <MuxPlayer
          ref={playerRef}
          playbackId={PLAYBACK_ID}
          accentColor="#ea580c"
          metadata={{ video_title: 'InstantDB 1.0 Launch' }}
          preload="auto"
          thumbnailTime={281}
          minResolution="1080p"
          renditionOrder="desc"
          style={{ aspectRatio: '16/9', display: 'block' }}
          onPlaying={() => setHasStarted(true)}
        />
      </div>

      {!hasStarted && (
        <button
          onClick={handlePlay}
          className="group relative w-full cursor-pointer"
        >
          <img
            src={THUMBNAIL_URL}
            alt="Watch demo video"
            className="block aspect-video w-full object-cover"
          />

          <div className="absolute inset-0 bg-black/30 transition-colors duration-300 group-hover:bg-black/40" />

          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
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
