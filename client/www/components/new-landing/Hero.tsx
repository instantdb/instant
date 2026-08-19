'use client';

import { useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { HeroTitle, SectionSubtitle } from './typography';
import { isSelfHosted } from '@/lib/config';

const VIDEO_URL =
  'https://stream.mux.com/RKzKMImR1oIGNLPTLjflaD02dNWo1003H00Pv6ZIIogo01g/1080p.mp4';
const THUMBNAIL_URL = '/video-previews/preview-4m41s.jpg';

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function VideoPlayer() {
  const [isLoading, setIsLoading] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const loadingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePlay = useCallback(() => {
    loadingTimer.current = setTimeout(() => setIsLoading(true), 500);
    const el = videoRef.current;
    if (el) {
      el.currentTime = 0;
      el.play();
    }
  }, []);

  return (
    <div className="relative aspect-video overflow-hidden shadow-[0_28px_90px_rgba(0,0,0,0.22)]">
      <div className={hasStarted ? '' : 'invisible absolute inset-0'}>
        <video
          ref={videoRef}
          src={VIDEO_URL}
          controls
          preload="auto"
          playsInline
          className="block aspect-video w-full"
          onPlaying={() => {
            if (loadingTimer.current) clearTimeout(loadingTimer.current);
            setHasStarted(true);
          }}
        >
          <track
            kind="captions"
            src="/video-previews/captions.vtt"
            srcLang="en"
            label="English"
            default
          />
        </video>
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
            {isLoading ? (
              <div className="h-16 w-16 animate-spin rounded-full border-4 border-white/30 border-t-white sm:h-24 sm:w-24 lg:h-28 lg:w-28" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-600 shadow-[0_20px_48px_rgba(234,88,12,0.55)] transition-transform duration-300 group-hover:scale-110 sm:h-24 sm:w-24 lg:h-28 lg:w-28">
                <PlayIcon className="ml-1 h-8 w-8 text-white sm:h-10 sm:w-10 lg:h-12 lg:w-12" />
              </div>
            )}
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
          {!isSelfHosted && (
            <Link
              href="/essays/instant_team_joins_openai"
              className="mb-8 inline-flex flex-wrap items-center justify-center gap-x-3 rounded-full border border-orange-200 bg-orange-100 px-7 py-3 text-base text-orange-900 shadow-sm transition-colors hover:bg-orange-200 sm:text-lg"
            >
              <span>
                <span className="font-semibold">
                  The Instant Team is joining OpenAI.
                </span>{' '}
                Services will continue until August 31st, 2027.
              </span>{' '}
              <span className="font-medium whitespace-nowrap text-orange-900/70">
                Learn more →
              </span>
            </Link>
          )}
          <HeroTitle>The best backend for AI-coded apps</HeroTitle>
          <SectionSubtitle>
            Give your AI a real backend. You get auth, permissions, storage,
            presence, and streams — everything you need to ship apps your users
            will love.
          </SectionSubtitle>
          <div className="mx-auto mt-10 max-w-[880px]">
            <VideoPlayer />
          </div>
        </div>
      </div>
    </section>
  );
}
