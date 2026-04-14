import type { ReactNode } from 'react';

const SLIDE_W = 1200;
const SLIDE_H = 675;
const THUMB_W = 380;
const THUMB_SCALE = THUMB_W / SLIDE_W;

function SlidePreview({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-8">
      <div style={{ width: SLIDE_W, height: SLIDE_H }} className="shrink-0">
        {children}
      </div>
      <div
        className="shrink-0 overflow-hidden"
        style={{
          width: THUMB_W,
          height: SLIDE_H * THUMB_SCALE,
        }}
      >
        <div
          style={{
            width: SLIDE_W,
            height: SLIDE_H,
            transform: `scale(${THUMB_SCALE})`,
            transformOrigin: 'top left',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function InstantLogo() {
  return (
    <div className="flex items-center gap-3">
      <img src="/img/icon/logo-512.svg" alt="" className="h-[32px] w-[32px]" />
      <span className="font-mono text-[38px] leading-none font-semibold tracking-tight text-black lowercase">
        instant
      </span>
    </div>
  );
}

// -------------------------------------------------------------------
// Shared components
// -------------------------------------------------------------------

type Task = {
  id: number;
  text: string;
  done: boolean;
  checkboxOpacity?: number;
};

function Checkbox({ done, opacity }: { done: boolean; opacity?: number }) {
  return (
    <div
      className={`flex h-5 w-5 items-center justify-center rounded-md border-2 ${
        done ? 'border-orange-600 bg-orange-600' : 'border-gray-300'
      }`}
      style={opacity != null ? { opacity } : undefined}
    >
      {done && (
        <svg
          className="h-3 w-3 text-white"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={3}
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
  );
}

function MiniTodoCard({
  name,
  img,
  items,
}: {
  name: string;
  img: string;
  items: Task[];
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2.5 px-1">
        <img
          src={img}
          alt={name}
          className="h-7 w-7 rounded-full object-cover"
        />
        <span className="text-sm font-medium">{name}</span>
      </div>
      <div className="w-[220px] rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 text-sm font-medium text-gray-500">Team Todos</div>
        <div className="space-y-1.5">
          {items.map((t) => (
            <div key={t.id} className="flex items-center gap-3 px-1 py-1">
              <Checkbox done={t.done} opacity={t.checkboxOpacity} />
              <span
                className={`text-sm ${t.done ? 'text-gray-400 line-through' : 'text-gray-700'}`}
              >
                {t.text}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Daniel checked "Review PR #42" → syncing to Joe (Joe's checkbox fading in)
// Joe unchecked "Update docs"   → syncing to Daniel (Daniel's checkbox fading out)

const danielTasks: Task[] = [
  { id: 1, text: 'Review PR #42', done: true },
  { id: 2, text: 'Deploy to staging', done: false },
  { id: 3, text: 'Update docs', done: true, checkboxOpacity: 0.4 },
];

const joeTasks: Task[] = [
  { id: 1, text: 'Review PR #42', done: true, checkboxOpacity: 0.4 },
  { id: 2, text: 'Deploy to staging', done: false },
  { id: 3, text: 'Update docs', done: false },
];

// -------------------------------------------------------------------
// Static sync dots and cursors
// -------------------------------------------------------------------

function SyncDot({
  left,
  top,
  size = 10,
  opacity = 1,
}: {
  left: string;
  top: string;
  size?: number;
  opacity?: number;
}) {
  return (
    <span
      className="pointer-events-none absolute rounded-full bg-green-400"
      style={{
        left,
        top,
        width: size,
        height: size,
        opacity,
        transform: 'translate(-50%, -50%)',
        boxShadow:
          '0 0 8px 2px rgba(74, 222, 128, 0.6), 0 0 20px 4px rgba(74, 222, 128, 0.3)',
      }}
    />
  );
}

function Cursor({
  left,
  top,
  img,
}: {
  left: string;
  top: string;
  img: string;
}) {
  return (
    <div
      className="pointer-events-none absolute"
      style={{ left, top, transform: 'translate(-2px, -2px)' }}
    >
      {/* Cursor arrow */}
      <svg width="16" height="20" viewBox="0 0 16 20" fill="none">
        <path
          d="M1 1L1 15.5L5.5 11.5L9.5 19L12.5 17.5L8.5 10L14 9L1 1Z"
          fill="black"
          stroke="white"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
      {/* Avatar */}
      <img
        src={img}
        alt=""
        className="mt-0.5 ml-3 h-5 w-5 rounded-full object-cover"
      />
    </div>
  );
}

// -------------------------------------------------------------------
// Slide
// -------------------------------------------------------------------

export function Slide4() {
  return (
    <div
      className="relative flex overflow-hidden bg-[#FBF9F6]"
      style={{ width: SLIDE_W, height: SLIDE_H }}
    >
      {/* Background glow */}
      <div
        className="pointer-events-none absolute"
        style={{
          top: '40%',
          left: '50%',
          width: 1100,
          height: 500,
          transform: 'translate(-50%, -50%)',
          background:
            'radial-gradient(ellipse at center, rgba(242,150,80,0.2) 0%, rgba(242,150,80,0.06) 50%, transparent 80%)',
        }}
      />

      <div className="relative z-10 flex h-full w-full flex-col items-center justify-center px-16">
        <h2 className="text-center text-[72px] leading-[1.2] font-normal tracking-tight">
          Your apps <span className="text-orange-600">sync</span>
        </h2>
        <p className="mt-4 max-w-2xl text-center text-2xl text-gray-500">
          Your app is multiplayer, works offline, and feels fast by default.
          This is the same tech that Linear and Figma use.
        </p>

        {/* Demo area */}
        <div className="relative mt-12 flex items-start gap-20">
          <div className="mt-10">
            <MiniTodoCard
              name="Daniel"
              img="/img/landing/daniel.png"
              items={danielTasks}
            />
          </div>
          <MiniTodoCard
            name="Joe"
            img="/img/landing/joe.jpg"
            items={joeTasks}
          />

          {/* Daniel's cursor on "Review PR" checkbox (left card, row 1) */}
          <Cursor left="32px" top="135px" img="/img/landing/daniel.png" />

          {/* Joe's cursor on "Update docs" checkbox (right card, row 3) */}
          <Cursor left="330px" top="160px" img="/img/landing/joe.jpg" />

          {/* "Review PR" check syncing Daniel → Joe (diagonal up-right) */}
          <SyncDot left="47%" top="108px" size={10} />
          <SyncDot left="51%" top="98px" size={7} opacity={0.6} />
          {/* "Update docs" uncheck syncing Joe → Daniel (diagonal down-left) */}
          <SyncDot left="53%" top="162px" size={10} />
          <SyncDot left="49%" top="172px" size={7} opacity={0.6} />
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------
// Page
// -------------------------------------------------------------------

export default function Slide4Page() {
  return (
    <div className="flex min-h-screen flex-col items-start gap-16 bg-gray-100 p-12">
      <h1 className="text-2xl font-medium text-gray-500">Slide 4</h1>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-gray-400">Sync — with cursors</p>
        <SlidePreview>
          <Slide4 />
        </SlidePreview>
      </div>
    </div>
  );
}
