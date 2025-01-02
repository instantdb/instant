import config from '@/lib/config'; // hide-line
import { init } from '@instantdb/react';
import { RefObject, createRef, useRef } from 'react';

const db = init({
  ...config, // hide-line
  appId: __getAppId(),
});

const { usePublishTopic, useTopicEffect } = db.room('topics-example', '123');

export default function InstantTopics() {
  const publishEmoji = usePublishTopic('emoji');

  useTopicEffect('emoji', ({ name, directionAngle, rotationAngle }) => {
    const emojiName = name as EmojiName;
    if (!emoji[emojiName]) return;

    animateEmoji(
      { emoji: emoji[emojiName], directionAngle, rotationAngle },
      elRefsRef.current[name].current
    );
  });

  const elRefsRef = useRef<{
    [k: string]: RefObject<HTMLDivElement>;
  }>(refsInit);

  return (
    <div className={containerClassNames}>
      <div className="flex gap-4">
        {emojiNames.map((name) => (
          <div className="relative" key={name} ref={elRefsRef.current[name]}>
            <button
              className={emojiButtonClassNames}
              onClick={() => {
                const params = {
                  name,
                  rotationAngle: Math.random() * 360,
                  directionAngle: Math.random() * 360,
                };
                animateEmoji(
                  {
                    emoji: emoji[name],
                    rotationAngle: params.rotationAngle,
                    directionAngle: params.directionAngle,
                  },
                  elRefsRef.current[name].current
                );

                publishEmoji(params);
              }}
            >
              {emoji[name]}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

type EmojiName = keyof typeof emoji;

const emoji = {
  fire: '🔥',
  wave: '👋',
  confetti: '🎉',
  heart: '❤️',
} as const;

const emojiNames = Object.keys(emoji) as EmojiName[];

const refsInit = Object.fromEntries(
  emojiNames.map((name) => [name, createRef<HTMLDivElement>()])
);

const containerClassNames =
  'flex h-screen w-screen items-center justify-center overflow-hidden bg-gray-200 select-none';

const emojiButtonClassNames =
  'rounded-lg bg-white p-3 text-3xl shadow-lg transition duration-200 ease-in-out hover:-translate-y-1 hover:shadow-xl';

function animateEmoji(
  config: { emoji: string; directionAngle: number; rotationAngle: number },
  target: HTMLDivElement | null
) {
  if (!target) return;

  const rootEl = document.createElement('div');
  const directionEl = document.createElement('div');
  const spinEl = document.createElement('div');

  spinEl.innerText = config.emoji;
  directionEl.appendChild(spinEl);
  rootEl.appendChild(directionEl);
  target.appendChild(rootEl);

  style(rootEl, {
    transform: `rotate(${config.directionAngle * 360}deg)`,
    position: 'absolute',
    top: '0',
    left: '0',
    right: '0',
    bottom: '0',
    margin: 'auto',
    zIndex: '9999',
    pointerEvents: 'none',
  });

  style(spinEl, {
    transform: `rotateZ(${config.rotationAngle * 400}deg)`,
    fontSize: `40px`,
  });

  setTimeout(() => {
    style(directionEl, {
      transform: `translateY(40vh) scale(2)`,
      transition: 'all 400ms',
      opacity: '0',
    });
  }, 20);

  setTimeout(() => rootEl.remove(), 800);
}

function style(el: HTMLElement, styles: Partial<CSSStyleDeclaration>) {
  Object.assign(el.style, styles);
}
