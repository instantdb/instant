'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';

const confettiEmojis = ['☁️', '✨', '🚀', '📸', '⬆️', '💫', '🌈', '⚡'];

function spawnEmojiConfetti(container: HTMLDivElement) {
  const count = 10;
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    const isEmoji = i % 2 === 0;
    el.innerText = isEmoji
      ? confettiEmojis[Math.floor(Math.random() * confettiEmojis.length)]
      : 'Uploading!';
    container.appendChild(el);

    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const dist = 120 + Math.random() * 100;
    const xDrift = Math.cos(angle) * dist;
    const yDrift = Math.sin(angle) * dist;
    const delay = i * 60;
    const duration = 1200 + Math.random() * 400;
    const rotation = (Math.random() - 0.5) * 60;

    Object.assign(el.style, {
      position: 'absolute',
      left: '50%',
      top: '50%',
      fontSize: isEmoji ? '32px' : '18px',
      fontWeight: isEmoji ? '400' : '800',
      color: isEmoji ? '' : 'white',
      textShadow: isEmoji ? 'none' : '0 2px 8px rgba(0,0,0,0.3)',
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
      zIndex: '9999',
      transform: 'translate(-50%, -50%) scale(0)',
      opacity: '1',
      transition: `transform ${duration}ms cubic-bezier(0.15, 0.6, 0.3, 1), opacity ${duration}ms ease-out`,
      transitionDelay: `${delay}ms`,
    });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        Object.assign(el.style, {
          transform: `translate(calc(-50% + ${xDrift}px), calc(-50% + ${yDrift}px)) scale(1) rotate(${rotation}deg)`,
          opacity: '0',
        });
      });
    });

    setTimeout(() => el.remove(), duration + delay + 50);
  }
}

function StorageDemo() {
  const [phase, setPhase] = useState<
    'compose' | 'uploading' | 'typing' | 'post'
  >('compose');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [typedText, setTypedText] = useState('');
  const [imageDropped, setImageDropped] = useState(false);

  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const confettiRef = useRef<HTMLDivElement>(null);
  const hasStarted = useRef(false);
  const caption = 'Newest member of the team';

  const clear = useCallback(() => {
    timeouts.current.forEach(clearTimeout);
    timeouts.current = [];
  }, []);

  const sched = (fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timeouts.current.push(t);
  };

  const runCycle = useCallback(() => {
    clear();
    setPhase('compose');
    setUploadProgress(0);
    setTypedText('');
    setImageDropped(false);

    let t = 600;

    sched(() => {
      setImageDropped(true);
      setPhase('uploading');
    }, t);

    sched(() => {
      if (confettiRef.current) spawnEmojiConfetti(confettiRef.current);
    }, t + 300);

    sched(() => {
      if (confettiRef.current) spawnEmojiConfetti(confettiRef.current);
    }, t + 1250);

    const uploadDuration = 2500;
    const uploadSteps = 40;
    const stepMs = uploadDuration / uploadSteps;
    for (let i = 1; i <= uploadSteps; i++) {
      const progress = Math.round((i / uploadSteps) * 100);
      sched(() => setUploadProgress(progress), t + i * stepMs);
    }
    t += uploadDuration + 400;

    sched(() => setPhase('typing'), t);
    t += 300;

    for (let i = 0; i <= caption.length; i++) {
      const text = caption.slice(0, i);
      sched(() => setTypedText(text), t + i * 50);
    }
    t += caption.length * 50 + 500;

    sched(() => setPhase('post'), t);
    t += 3000;
    sched(() => runCycle(), t);
  }, [clear]);

  useEffect(() => {
    if (!hasStarted.current) {
      hasStarted.current = true;
      runCycle();
    }
    return () => clear();
  }, [runCycle, clear]);

  const circumference = 2 * Math.PI * 54;
  const strokeOffset = circumference - (uploadProgress / 100) * circumference;

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="flex items-center border-b border-gray-100 px-8 py-4">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-indigo-500" />
          <span className="text-lg font-semibold text-gray-800">Photos</span>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-8">
        <div
          className="relative w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
          style={{ overflow: 'visible' }}
        >
          <AnimatePresence mode="wait">
            {phase !== 'post' ? (
              <motion.div
                key="compose"
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
              >
                <div className="mb-6 flex items-center gap-3">
                  <img
                    src="/img/landing/stopa.jpg"
                    alt="stopa"
                    className="h-10 w-10 rounded-full object-cover"
                  />
                  <span className="text-base font-semibold text-gray-900">
                    stopa
                  </span>
                </div>

                <div className="mb-4">
                  {imageDropped ? (
                    <div
                      ref={confettiRef}
                      className="relative rounded-lg"
                      style={{ overflow: 'visible' }}
                    >
                      <img
                        src="/img/landing/dog-post.jpg"
                        alt="Dog"
                        className="w-full rounded-lg object-cover"
                        style={{ aspectRatio: '4/3' }}
                      />
                      {phase === 'uploading' && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-black/40">
                          <div className="relative">
                            <svg className="h-32 w-32 -rotate-90">
                              <circle
                                cx="64"
                                cy="64"
                                r="54"
                                fill="none"
                                stroke="rgba(255,255,255,0.2)"
                                strokeWidth="8"
                              />
                              <circle
                                cx="64"
                                cy="64"
                                r="54"
                                fill="none"
                                stroke="white"
                                strokeWidth="8"
                                strokeLinecap="round"
                                strokeDasharray={circumference}
                                strokeDashoffset={strokeOffset}
                                className="transition-all duration-75"
                              />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="text-3xl font-bold text-white">
                                {uploadProgress}%
                              </span>
                            </div>
                          </div>
                          <motion.p
                            className="mt-4 text-xl font-bold text-white"
                            animate={{ scale: [1, 1.1, 1] }}
                            transition={{ duration: 0.8, repeat: Infinity }}
                          >
                            Uploading!
                          </motion.p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 py-16 text-gray-300">
                      <svg
                        className="h-12 w-12"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z"
                        />
                      </svg>
                      <span className="mt-2 text-sm">Drop image here</span>
                    </div>
                  )}
                </div>

                <div className="min-h-[28px] text-base text-gray-800">
                  {typedText ? (
                    <span>
                      {typedText}
                      {phase === 'typing' && (
                        <span className="animate-pulse text-gray-400">|</span>
                      )}
                    </span>
                  ) : (
                    <span className="text-gray-300">Write a caption...</span>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="post"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                <div className="mb-4 flex items-center gap-3">
                  <img
                    src="/img/landing/stopa.jpg"
                    alt="stopa"
                    className="h-10 w-10 rounded-full object-cover"
                  />
                  <span className="text-base font-semibold text-gray-900">
                    stopa
                  </span>
                </div>
                <div className="mb-4 overflow-hidden rounded-lg">
                  <img
                    src="/img/landing/dog-post.jpg"
                    alt="Dog"
                    className="aspect-square w-full object-cover"
                  />
                </div>
                <p className="text-base text-gray-800">
                  <span className="font-semibold">stopa</span>{' '}
                  <span className="text-gray-600">
                    Newest member of the team
                  </span>
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

export default function StorageDemoPage() {
  return <StorageDemo />;
}
