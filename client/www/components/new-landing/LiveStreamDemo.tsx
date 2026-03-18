import { useRef, useCallback } from 'react';
import { motion, useAnimation } from 'motion/react';

const REACTIONS = [
  '\u2764\uFE0F',
  '\uD83D\uDD25',
  '\uD83C\uDF89',
  '\uD83D\uDC4F',
] as const;

interface FloaterParams {
  startX: number;
  drift1: number;
  drift2: number;
  drift3: number;
  drift4: number;
  rotation: number;
}

function randomFloaterParams(): FloaterParams {
  const startX = 20 + Math.random() * 60;
  const driftRange = 18;
  return {
    startX,
    drift1: (Math.random() - 0.5) * driftRange,
    drift2: (Math.random() - 0.5) * driftRange,
    drift3: (Math.random() - 0.5) * driftRange,
    drift4: (Math.random() - 0.5) * driftRange,
    rotation: (Math.random() - 0.5) * 40,
  };
}

function spawnFloater(emoji: string, container: HTMLElement, p: FloaterParams) {
  const el = document.createElement('span');
  el.textContent = emoji;
  el.style.cssText = `position:absolute;pointer-events:none;font-size:20px;line-height:1;bottom:10px;left:${p.startX}%;margin-left:-0.5em;z-index:10;`;
  container.appendChild(el);

  const anim = el.animate(
    [
      {
        opacity: 0.7,
        transform: `translateY(0) translateX(0) scale(0.5) rotate(0deg)`,
      },
      {
        opacity: 1,
        transform: `translateY(-30px) translateX(${p.drift1}px) scale(1.1) rotate(${p.rotation * 0.3}deg)`,
        offset: 0.2,
      },
      {
        opacity: 1,
        transform: `translateY(-70px) translateX(${p.drift2}px) scale(1) rotate(${-p.rotation * 0.5}deg)`,
        offset: 0.45,
      },
      {
        opacity: 0.8,
        transform: `translateY(-110px) translateX(${p.drift3}px) scale(0.95) rotate(${p.rotation * 0.4}deg)`,
        offset: 0.7,
      },
      {
        opacity: 0,
        transform: `translateY(-150px) translateX(${p.drift4}px) scale(0.7) rotate(${-p.rotation}deg)`,
      },
    ],
    { duration: 1800, easing: 'ease-out', fill: 'forwards' },
  );

  anim.onfinish = () => el.remove();
}

export function LiveStreamDemo() {
  const screenRefs = useRef<HTMLElement[]>([]);
  const videoRefs = useRef<HTMLVideoElement[]>([]);

  const registerScreen = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    if (!screenRefs.current.includes(el)) screenRefs.current.push(el);
  }, []);

  const registerVideo = useCallback((el: HTMLVideoElement | null) => {
    if (!el) return;
    if (!videoRefs.current.includes(el)) videoRefs.current.push(el);
  }, []);

  const react = useCallback((emoji: string, btn: HTMLButtonElement) => {
    const row = btn.parentElement;
    if (!row) return;
    const rowRect = row.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    const btnCenterInRow = btnRect.left + btnRect.width / 2 - rowRect.left;
    const offsetFromRowCenter = btnCenterInRow - rowRect.width / 2;

    const params = randomFloaterParams();
    screenRefs.current.forEach((s) => {
      const sWidth = s.getBoundingClientRect().width;
      const pct = ((sWidth / 2 + offsetFromRowCenter) / sWidth) * 100;
      spawnFloater(emoji, s, { ...params, startX: pct });
    });

    videoRefs.current.forEach((v) => {
      v.currentTime = 0;
      v.play();
    });
  }, []);

  const StreamCard = ({ tilt }: { tilt: string }) => {
    const controls = useAnimation();
    const wiggle = () => {
      controls.start({
        rotate: [0, -2, 2, -1, 1, 0],
        transition: { duration: 0.4, ease: 'easeInOut' },
      });
    };
    return (
      <div className={`flex flex-col items-center ${tilt}`}>
        <div className="relative mb-6">
          <motion.div
            animate={controls}
            onClick={wiggle}
            className="w-[280px] cursor-pointer overflow-hidden rounded-xl bg-white shadow-sm"
          >
            <div className="flex items-center gap-2.5 border-b border-gray-100 px-3 py-2">
              <span className="rounded bg-red-600 px-2 py-0.5 text-sm font-bold tracking-wide text-white">
                LIVE
              </span>
              <span className="text-base text-gray-500">14 viewers</span>
              <div className="ml-auto flex items-center gap-2 text-gray-300">
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 15 12 12 15 15"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 9 12 12 15 9"
                  />
                </svg>
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM12.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM18.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"
                  />
                </svg>
              </div>
            </div>
            <div
              ref={registerScreen}
              className="relative aspect-video overflow-hidden"
            >
              <video
                ref={registerVideo}
                autoPlay
                muted
                playsInline
                className="absolute inset-0 h-full w-full object-cover"
                src="/img/landing/stream-clip.mp4"
              />
              <div className="absolute right-0 bottom-0 left-0 z-10">
                <div className="h-[3px] w-full bg-black/20">
                  <div className="h-full w-full bg-red-500" />
                </div>
              </div>
            </div>
          </motion.div>
          <div className="absolute -bottom-5 left-1/2 z-20 flex -translate-x-1/2 gap-2">
            {REACTIONS.map((emoji) => (
              <button
                key={emoji}
                onClick={(e) => react(emoji, e.currentTarget)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-lg shadow-md transition-transform hover:bg-gray-50 active:scale-90"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col items-center justify-center gap-10 md:flex-row md:items-end">
      <StreamCard tilt="-rotate-2 translate-y-2" />
      <StreamCard tilt="rotate-1 -translate-y-3" />
    </div>
  );
}
