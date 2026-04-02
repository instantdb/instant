'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'motion/react';

function FakeCursor({
  x,
  y,
  clicking,
}: {
  x: number;
  y: number;
  clicking: boolean;
}) {
  return (
    <motion.div
      className="pointer-events-none absolute z-30"
      initial={false}
      animate={{ left: x, top: y, scale: clicking ? 0.85 : 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      <svg
        width="24"
        height="30"
        viewBox="0 0 16 20"
        fill="none"
        className="drop-shadow-md"
      >
        <path
          d="M1 1L1 15L5 11L9 18L12 16.5L8 9.5L13 9L1 1Z"
          fill="black"
          stroke="white"
          strokeWidth="1.5"
        />
      </svg>
    </motion.div>
  );
}

function StorageDemo() {
  const [phase, setPhase] = useState<
    'compose' | 'dragging' | 'uploading' | 'uploaded' | 'done'
  >('compose');
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [showCursor, setShowCursor] = useState(false);
  const [clicking, setClicking] = useState(false);
  const [showDragThumb, setShowDragThumb] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [typedText, setTypedText] = useState('');
  const [imageDropped, setImageDropped] = useState(false);

  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
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
    setShowCursor(false);
    setClicking(false);
    setShowDragThumb(false);

    let t = 400;

    // Cursor appears from the right, carrying a thumbnail
    sched(() => {
      setCursorPos({ x: 420, y: 120 });
      setShowCursor(true);
      setShowDragThumb(true);
      setPhase('dragging');
    }, t);

    t += 500;

    // Drag to the dropzone center
    sched(() => setCursorPos({ x: 200, y: 200 }), t);

    t += 800;

    // Drop the image
    sched(() => setClicking(true), t);
    t += 200;
    sched(() => {
      setClicking(false);
      setShowDragThumb(false);
      setImageDropped(true);
      setShowCursor(false);
      setPhase('uploading');
    }, t);

    // Upload progress (1000ms)
    const uploadDuration = 1000;
    const uploadSteps = 25;
    const stepMs = uploadDuration / uploadSteps;
    for (let i = 1; i <= uploadSteps; i++) {
      const progress = Math.round((i / uploadSteps) * 100);
      sched(() => setUploadProgress(progress), t + i * stepMs);
    }

    // Start typing caption at the same time as upload
    const typingStart = t + 200;
    for (let i = 0; i <= caption.length; i++) {
      const text = caption.slice(0, i);
      sched(() => setTypedText(text), typingStart + i * 60);
    }

    // Upload finishes — show checkmark in ring
    t += uploadDuration + 200;
    sched(() => setPhase('uploaded'), t);

    // Fade everything out
    sched(() => setPhase('done'), t + 800);

    const typingEnd = typingStart + caption.length * 60 + 400;
    const holdEnd = Math.max(t + 1400, typingEnd + 500);
    sched(() => runCycle(), holdEnd + 2500);
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

  const isTyping = typedText.length > 0 && typedText.length < caption.length;
  const showOverlay = phase === 'uploading' || phase === 'uploaded';

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="flex items-center border-b border-gray-100 px-8 py-4">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-indigo-500" />
          <span className="text-lg font-semibold text-gray-800">Photos</span>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-8">
        <div className="relative w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <img
              src="/img/landing/stopa.jpg"
              alt="stopa"
              className="h-10 w-10 rounded-full object-cover"
            />
            <span className="text-base font-semibold text-gray-900">stopa</span>
          </div>

          <div className="mb-4">
            {imageDropped ? (
              <div className="relative rounded-lg">
                <img
                  src="/img/landing/dog-post.jpg"
                  alt="Dog"
                  className="w-full rounded-lg object-cover"
                  style={{ aspectRatio: '4/3' }}
                />
                {showOverlay && (
                  <motion.div
                    className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-black/40"
                    animate={{ opacity: phase === 'uploaded' ? [1, 0] : 1 }}
                    transition={{
                      duration: phase === 'uploaded' ? 0.6 : 0.2,
                      delay: phase === 'uploaded' ? 0.3 : 0,
                      ease: 'easeOut',
                    }}
                  >
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
                          stroke={
                            phase === 'uploaded'
                              ? 'rgb(34, 197, 94)'
                              : 'white'
                          }
                          strokeWidth="8"
                          strokeLinecap="round"
                          strokeDasharray={circumference}
                          strokeDashoffset={strokeOffset}
                          className="transition-all duration-150"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        {phase === 'uploaded' ? (
                          <motion.div
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{
                              type: 'spring',
                              stiffness: 400,
                              damping: 15,
                            }}
                          >
                            <svg
                              className="h-12 w-12 text-green-400"
                              fill="none"
                              viewBox="0 0 24 24"
                              strokeWidth={3}
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M4.5 12.75l6 6 9-13.5"
                              />
                            </svg>
                          </motion.div>
                        ) : (
                          <span className="text-3xl font-bold text-white">
                            {uploadProgress}%
                          </span>
                        )}
                      </div>
                    </div>
                    {phase === 'uploading' && (
                      <p className="mt-4 text-xl font-bold text-white">
                        Uploading!
                      </p>
                    )}
                  </motion.div>
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
                {isTyping && (
                  <span className="animate-pulse text-gray-400">|</span>
                )}
              </span>
            ) : (
              <span className="text-gray-300">Write a caption...</span>
            )}
          </div>

          {/* Drag thumbnail following cursor */}
          {showDragThumb && (
            <motion.div
              className="pointer-events-none absolute z-20"
              animate={{ left: cursorPos.x + 16, top: cursorPos.y + 16 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
              <div className="h-16 w-16 overflow-hidden rounded-lg border-2 border-white shadow-lg">
                <img
                  src="/img/landing/dog-post.jpg"
                  alt="Dog"
                  className="h-full w-full object-cover"
                />
              </div>
            </motion.div>
          )}

          {showCursor && (
            <FakeCursor x={cursorPos.x} y={cursorPos.y} clicking={clicking} />
          )}
        </div>
      </div>
    </div>
  );
}

export default function StorageDemoPage() {
  return <StorageDemo />;
}
