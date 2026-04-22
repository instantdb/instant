'use client';

import type { ReactNode } from 'react';
import { rosePineDawnColors as c } from '@/lib/rosePineDawnTheme';

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

function ClaudeIcon({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
      <path d="M4.32 17.18L8.79 14.68L8.86 14.47L8.79 14.35H8.58L7.87 14.31L5.47 14.24L3.39 14.16L1.38 14.05L0.87 13.94L0.39 13.32L0.44 13.01L0.87 12.72L1.48 12.77L2.84 12.87L4.88 13L6.36 13.09L8.55 13.32H8.89L8.94 13.18L8.82 13.09L8.72 13L6.5 11.5L4.1 9.9L2.85 8.99L2.17 8.53L1.83 8.1L1.69 7.16L2.31 6.48L3.15 6.54L3.36 6.6L4.2 7.25L6 8.6L8.35 10.33L8.69 10.62L8.83 10.52L8.85 10.45L8.69 10.18L7.37 7.8L5.96 5.37L5.33 4.37L5.17 3.77C5.11 3.53 5.07 3.32 5.07 3.07L5.78 2.11L6.17 1.98L7.11 2.11L7.51 2.46L8.1 3.8L9.05 5.92L10.53 8.81L10.96 9.66L11.19 10.45L11.28 10.69H11.42V10.56L11.53 9.06L11.73 7.22L11.92 4.86L11.99 4.19L12.31 3.43L12.94 3.01L13.43 3.25L13.83 3.82L13.77 4.19L13.53 5.78L13.05 8.28L12.74 9.95H12.92L13.13 9.74L13.98 8.62L15.42 6.82L16.05 6.11L16.79 5.32L17.27 4.94H18.17L18.83 5.92L18.53 6.93L17.6 8.11L16.83 9.11L15.72 10.6L15.03 11.78L15.09 11.87H15.25L17.6 11.37L18.87 11.14L20.39 10.88L21.07 11.2L21.15 11.52L20.88 12.18L19.27 12.58L17.38 12.96L14.57 13.62L14.54 13.64L14.57 13.69L15.84 13.81L16.38 13.84H17.71L20.19 14.02L20.83 14.44L21.22 14.97L21.16 15.37L20.18 15.87L18.86 15.56L15.78 14.83L14.72 14.57H14.57V14.66L15.45 15.52L17.07 16.98L19.1 18.87L19.2 19.34L18.94 19.71L18.66 19.67L16.84 18.3L16.14 17.68L14.55 16.34H14.45V16.47L14.82 17L16.75 19.91L16.85 20.8L16.71 21.09L16.21 21.27L15.66 21.17L14.53 19.58L13.36 17.79L12.42 16.18L12.31 16.24L11.75 22.31L11.49 22.62L10.89 22.85L10.39 22.46L10.13 21.85L10.39 20.65L10.7 19.07L10.95 17.81L11.19 16.25L11.33 15.73L11.32 15.69L11.24 15.7L10.39 16.87L9.1 18.62L8.07 19.71L7.83 19.81L7.41 19.6L7.45 19.2L7.68 18.86L9.04 17.12L9.86 16.05L10.39 15.42L10.38 15.34H10.36L7.37 17.28L6.84 17.35L6.61 17.13L6.64 16.78L6.74 16.67L7.62 16.06L4.32 17.18Z" />
    </svg>
  );
}

// Claude-like chat/CLI box with a prompt. "Read getadb.com first" is highlighted.
function AgentTerminal() {
  return (
    <div
      className="overflow-hidden rounded-xl border border-gray-200 shadow-2xl"
      style={{ backgroundColor: c.bg }}
    >
      {/* Title bar */}
      <div className="relative flex items-center gap-2 border-b border-gray-200 px-4 py-3">
        <div className="h-3 w-3 rounded-full bg-[#ed6a5e]" />
        <div className="h-3 w-3 rounded-full bg-[#f5bf4f]" />
        <div className="h-3 w-3 rounded-full bg-[#62c554]" />
        <span
          className="absolute inset-x-0 flex items-center justify-center gap-1.5 text-sm"
          style={{ color: c.punctuation }}
        >
          <ClaudeIcon className="h-4 w-4" style={{ color: '#D97757' }} />
          Claude Code
        </span>
      </div>

      {/* Prompt input */}
      <div className="p-6 font-mono text-[22px] leading-relaxed">
        <div className="flex items-baseline gap-2">
          <span style={{ color: c.keyword }}>&gt;</span>
          <span style={{ color: c.text }}>Build me a todo app. </span>
          <span
            className="rounded px-1.5 py-0.5"
            style={{
              color: '#D97757',
              backgroundColor: 'rgba(217,119,87,0.12)',
            }}
          >
            Read getadb.com first
          </span>
        </div>

        {/* Agent response */}
        <div className="mt-5 space-y-1.5">
          <div className="flex items-center gap-2">
            <ClaudeIcon className="h-4 w-4" style={{ color: '#D97757' }} />
            <span style={{ color: c.text }}>
              Fetching rules from <u>getadb.com</u>...
            </span>
          </div>
          <div>
            <span style={{ color: '#62c554' }}>✓</span>
            <span className="ml-2" style={{ color: c.text }}>
              Provisioned Instant DB
            </span>
          </div>
          <div>
            <span style={{ color: '#62c554' }}>✓</span>
            <span className="ml-2" style={{ color: c.text }}>
              Schema &amp; permissions ready
            </span>
          </div>
          <div>
            <span style={{ color: '#62c554' }}>✓</span>
            <span className="ml-2" style={{ color: c.text }}>
              Wired into the app
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// A light-mode "chat bubble" version of the prompt
function PromptBubble({
  size = 'lg',
  text = 'Build me a todo app.',
}: {
  size?: 'xl' | 'lg' | 'md';
  text?: string;
}) {
  const textSize =
    size === 'xl'
      ? 'text-[42px]'
      : size === 'lg'
        ? 'text-[28px]'
        : 'text-[22px]';
  const padding =
    size === 'xl' ? 'px-10 py-7' : size === 'lg' ? 'px-7 py-5' : 'px-6 py-4';
  const maxW = size === 'xl' ? 'max-w-[1120px]' : 'max-w-[640px]';
  const nowrap = size === 'xl' ? 'whitespace-nowrap' : '';
  return (
    <div
      className={`inline-flex ${maxW} items-baseline gap-3 rounded-2xl border border-gray-200 bg-white shadow-lg ${padding} ${nowrap}`}
    >
      <span className={`${textSize} text-gray-800`}>{text}</span>
      <span
        className={`${textSize} rounded-md px-2 py-0.5 font-medium`}
        style={{
          color: '#D97757',
          backgroundColor: 'rgba(217,119,87,0.12)',
        }}
      >
        Read getadb.com first
      </span>
    </div>
  );
}

// A "sending to agent" visual — prompt card with an arrow to an agent
function AgentDest({
  name,
  icon,
  bg,
}: {
  name: string;
  icon: ReactNode;
  bg: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <div
        className="flex h-9 w-9 items-center justify-center rounded-lg"
        style={{ backgroundColor: bg }}
      >
        {icon}
      </div>
      <span className="text-lg font-medium text-gray-800">{name}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Variation A — Terminal hero (dark-terminal vibe on warm bg)
// ─────────────────────────────────────────────────────────

export function Slide9A() {
  return (
    <div
      className="relative flex overflow-hidden bg-[#FBF9F6]"
      style={{ width: SLIDE_W, height: SLIDE_H }}
    >
      <div
        className="pointer-events-none absolute"
        style={{
          top: '45%',
          left: '50%',
          width: 1100,
          height: 500,
          transform: 'translate(-50%, -50%)',
          background:
            'radial-gradient(ellipse at center, rgba(242,150,80,0.2) 0%, rgba(242,150,80,0.06) 50%, transparent 80%)',
        }}
      />

      <div className="relative z-10 flex h-full w-full flex-col items-center justify-center px-16">
        <h2 className="text-center text-[64px] leading-[1.15] font-normal tracking-tight">
          Tell your agent
          <br />
          <span
            className="rounded-lg px-3 py-1 font-mono text-[56px]"
            style={{
              color: '#D97757',
              backgroundColor: 'rgba(217,119,87,0.1)',
            }}
          >
            Read getadb.com first
          </span>
        </h2>
        <p className="mt-5 text-center text-2xl text-gray-500">
          Drop it in any prompt and your agent provisions a full Instant DB
        </p>
        <div className="mt-10 w-[780px]" style={{ transform: 'rotate(0.5deg)' }}>
          <AgentTerminal />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Variation B — Prompt bubble "flying" to multiple agents
// ─────────────────────────────────────────────────────────

function V0Logo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 147 70"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M56 50.2031V14H70V60.1562C70 65.5928 65.5928 70 60.1562 70C57.5605 70 54.9982 68.9992 53.1562 67.1573L0 14H19.7969L56 50.2031Z" />
      <path d="M147 56H133V23.9531L100.953 56H133V70H96.6875C85.8144 70 77 61.1856 77 50.3125V14H91V46.1562L123.156 14H91V0H127.312C138.186 0 147 8.81439 147 19.6875V56Z" />
    </svg>
  );
}

function LovableLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      role="img"
      aria-label="Lovable"
      viewBox="0 0 23 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <mask
        id="lovable-mask"
        maskUnits="userSpaceOnUse"
        x="0"
        y="0"
        width="23"
        height="24"
        style={{ maskType: 'alpha' }}
      >
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M6.89785 0C10.7074 0 13.7957 3.17898 13.7957 7.10046V9.79908H16.0913C19.9009 9.79908 22.9892 12.9781 22.9892 16.8995C22.9892 20.821 19.9009 24 16.0913 24H0V7.10046C0 3.17898 3.08827 0 6.89785 0Z"
          fill="url(#lovable-gradient)"
        />
      </mask>
      <g mask="url(#lovable-mask)">
        <g filter="url(#lovable-f0)">
          <ellipse
            cx="10.0844"
            cy="12.8114"
            rx="15.5619"
            ry="15.9769"
            fill="#4B73FF"
          />
        </g>
        <g filter="url(#lovable-f1)">
          <ellipse
            cx="11.7941"
            cy="4.04332"
            rx="19.9306"
            ry="15.9769"
            fill="#FF66F4"
          />
        </g>
        <g filter="url(#lovable-f2)">
          <ellipse
            cx="15.0451"
            cy="1.037"
            rx="15.5619"
            ry="14.0311"
            fill="#FF0105"
          />
        </g>
        <g filter="url(#lovable-f3)">
          <ellipse
            cx="12.071"
            cy="4.03913"
            rx="9.35889"
            ry="9.60846"
            fill="#FE7B02"
          />
        </g>
      </g>
      <defs>
        <filter
          id="lovable-f0"
          x="-12.6378"
          y="-10.3257"
          width="45.4442"
          height="46.2743"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur stdDeviation="3.58011" />
        </filter>
        <filter
          id="lovable-f1"
          x="-15.2967"
          y="-19.0938"
          width="54.1815"
          height="46.2743"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur stdDeviation="3.58011" />
        </filter>
        <filter
          id="lovable-f2"
          x="-7.67707"
          y="-20.1544"
          width="45.4442"
          height="42.3827"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur stdDeviation="3.58011" />
        </filter>
        <filter
          id="lovable-f3"
          x="-4.44806"
          y="-12.7296"
          width="33.0382"
          height="33.5375"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur stdDeviation="3.58011" />
        </filter>
        <linearGradient
          id="lovable-gradient"
          x1="7.73627"
          y1="4.21757"
          x2="15.0724"
          y2="23.8669"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0.025" stopColor="#FF8E63" />
          <stop offset="0.56" stopColor="#FF7EB0" />
          <stop offset="0.95" stopColor="#4B73FF" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function FigmaMakeLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <rect fill="#D2DAE4" rx="4" height="24" width="24" />
      <path
        fillOpacity="0.9"
        fill="black"
        d="M14.6699 11.6376C14.8556 11.6573 15 11.8141 15 12.0009C15 14.382 14.7164 16.5566 14.2471 18.1522C14.0134 18.9465 13.7258 19.626 13.3838 20.1181C13.0519 20.5953 12.592 21.0008 12 21.0009C11.408 21.0008 10.9481 20.5953 10.6162 20.1181C10.2742 19.626 9.98655 18.9465 9.75293 18.1522C9.64937 17.8001 9.55614 17.4192 9.47266 17.0145C9.40742 16.6971 9.66681 16.4119 9.99023 16.4335C10.2176 16.4487 10.4104 16.6148 10.457 16.8378C10.5339 17.2067 10.6185 17.5524 10.7119 17.87C10.9306 18.6136 11.1815 19.1796 11.4375 19.5477C11.7034 19.9301 11.9018 20.0008 12 20.0009C12.0982 20.0008 12.2966 19.9301 12.5625 19.5477C12.8185 19.1796 13.0694 18.6136 13.2881 17.87C13.7236 16.3893 14 14.314 14 12.0009C14 11.7728 14.1899 11.5907 14.417 11.6122C14.5021 11.6203 14.5864 11.6287 14.6699 11.6376ZM6.98438 9.47353C7.30159 9.40798 7.5871 9.66692 7.56641 9.99013C7.55176 10.2174 7.38601 10.4103 7.16309 10.4569C6.79398 10.5341 6.44864 10.6193 6.13086 10.7128C5.38721 10.9315 4.82131 11.1823 4.45312 11.4384C4.07048 11.7045 4 11.9027 4 12.0009C4.00004 12.0991 4.07055 12.2973 4.45312 12.5634C4.82131 12.8194 5.38722 13.0702 6.13086 13.289C7.61162 13.7244 9.68681 14.0009 12 14.0009C12.2275 14.0009 12.4086 14.1895 12.3867 14.4159C12.3782 14.5029 12.3696 14.5894 12.3604 14.6747C12.3403 14.8587 12.185 15.0009 12 15.0009C9.61889 15.0009 7.44426 14.7172 5.84863 14.2479C5.05427 14.0143 4.37485 13.7267 3.88281 13.3847C3.40549 13.0527 3.00004 12.593 3 12.0009C3 11.4087 3.40548 10.949 3.88281 10.6171C4.37485 10.275 5.05425 9.98744 5.84863 9.7538C6.2003 9.65037 6.5803 9.55702 6.98438 9.47353ZM12 9.00087C14.3811 9.00087 16.5557 9.2845 18.1514 9.7538C18.9457 9.98744 19.6252 10.275 20.1172 10.6171C20.5945 10.949 21 11.4087 21 12.0009C21 12.593 20.5945 13.0527 20.1172 13.3847C19.6252 13.7267 18.9457 14.0143 18.1514 14.2479C17.7995 14.3514 17.4191 14.444 17.0146 14.5272C16.6974 14.5925 16.412 14.3338 16.4326 14.0106C16.4473 13.7833 16.613 13.5903 16.8359 13.5438C17.2054 13.4669 17.5511 13.3825 17.8691 13.289C18.6128 13.0702 19.1787 12.8194 19.5469 12.5634C19.9295 12.2973 20 12.0991 20 12.0009C20 11.9027 19.9295 11.7045 19.5469 11.4384C19.1787 11.1823 18.6128 10.9315 17.8691 10.7128C16.3884 10.2773 14.3132 10.0009 12 10.0009C11.7721 10.0009 11.5905 9.81069 11.6123 9.58388C11.6207 9.49759 11.6295 9.41167 11.6387 9.32704C11.6587 9.14254 11.8144 9.00087 12 9.00087ZM12 3.00087C12.592 3.00097 13.0519 3.40644 13.3838 3.88368C13.7258 4.3757 14.0134 5.05519 14.2471 5.8495C14.3505 6.20104 14.4432 6.58128 14.5264 6.98524C14.5916 7.30277 14.3323 7.5881 14.0088 7.56728C13.7815 7.55251 13.5884 7.38692 13.542 7.16396C13.4654 6.79501 13.3815 6.44931 13.2881 6.13173C13.0694 5.38816 12.8185 4.82218 12.5625 4.45399C12.2966 4.07168 12.0982 4.00097 12 4.00087C11.9018 4.00097 11.7034 4.07168 11.4375 4.45399C11.1815 4.82218 10.9306 5.38816 10.7119 6.13173C10.2764 7.61248 10 9.6877 10 12.0009C10 12.2283 9.81042 12.4098 9.58398 12.3886C9.49766 12.3804 9.41181 12.3722 9.32715 12.3632C9.14206 12.3435 9 12.187 9 12.0009C9 9.61978 9.28364 7.44512 9.75293 5.8495C9.98655 5.05519 10.2742 4.3757 10.6162 3.88368C10.9481 3.40644 11.408 3.00097 12 3.00087Z"
      />
    </svg>
  );
}

function ReplitLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 22 30"
      fill="#FF3C00"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M10.79 7.72365C10.79 7.85696 10.79 7.92361 10.7947 7.99122C10.8234 8.40818 11.0001 8.83473 11.2746 9.14987C11.3191 9.20098 11.3596 9.24141 11.4404 9.32227C11.8007 9.68251 12.2925 9.87793 12.802 9.87793H18.3224C19.4258 9.87793 19.9775 9.87793 20.3989 10.0927C20.7696 10.2815 21.071 10.5829 21.2599 10.9536C21.4746 11.3751 21.4746 11.9267 21.4746 13.0301V16.3635C21.4746 17.4668 21.4746 18.0185 21.2599 18.4399C21.071 18.8106 20.7696 19.112 20.3989 19.3009C19.9775 19.5156 19.4258 19.5156 18.3224 19.5156H12.7888C12.2847 19.5156 11.7979 19.709 11.4414 20.0654C11.3597 20.1471 11.3189 20.1879 11.2742 20.2393C11.0001 20.5542 10.8236 20.9803 10.7947 21.3968C10.79 21.4647 10.79 21.5314 10.79 21.6647V26.2599C10.79 27.3633 10.79 27.915 10.5753 28.3364C10.3864 28.7071 10.085 29.0085 9.71434 29.1974C9.29291 29.4121 8.74123 29.4121 7.63787 29.4121H3.15217C2.04881 29.4121 1.49713 29.4121 1.0757 29.1974C0.704998 29.0085 0.40361 28.7071 0.214729 28.3364C0 27.915 0 27.3633 0 26.2599V22.6981C0 21.5947 0 21.043 0.214729 20.6216C0.40361 20.2509 0.704998 19.9495 1.0757 19.7606C1.49713 19.5459 2.04881 19.5459 3.15217 19.5459H8.70118C8.72901 19.5459 8.74293 19.5459 8.75893 19.5456C9.24848 19.5377 9.74539 19.3319 10.0972 18.9913C10.1087 18.9802 10.1138 18.9751 10.124 18.9648C10.2195 18.8694 10.2672 18.8217 10.317 18.7635C10.5817 18.454 10.7525 18.0418 10.7841 17.6357C10.79 17.5594 10.79 17.4835 10.79 17.3319V12.0565C10.79 11.9048 10.79 11.829 10.784 11.7522C10.7523 11.3467 10.5818 10.9349 10.3174 10.6257C10.2674 10.5672 10.2193 10.5191 10.123 10.4229C9.76256 10.0624 9.27061 9.86621 8.76081 9.86621H3.15217C2.04881 9.86621 1.49713 9.86621 1.0757 9.65148C0.704998 9.4626 0.40361 9.16121 0.214729 8.79051C0 8.36908 0 7.8174 0 6.71404V3.15217C0 2.04881 0 1.49713 0.214729 1.0757C0.40361 0.704998 0.704998 0.40361 1.0757 0.214729C1.49713 0 2.04881 0 3.15217 0H7.63787C8.74123 0 9.29291 0 9.71434 0.214729C10.085 0.40361 10.3864 0.704998 10.5753 1.0757C10.79 1.49713 10.79 2.04881 10.79 3.15217V7.72365Z" />
    </svg>
  );
}

const AGENT_CELL_W = 96;
const AGENT_CELL_H = 80;

function AgentLogoCell({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center"
      style={{ width: AGENT_CELL_W, height: AGENT_CELL_H }}
    >
      {children}
    </div>
  );
}

const agentLogos = [
  {
    key: 'claude',
    rotate: -5,
    y: 4,
    node: (
      <img
        src="/img/slides/agents/claude.png"
        alt="Claude"
        className="h-16 w-auto object-contain"
      />
    ),
  },
  {
    key: 'codex',
    rotate: 3,
    y: -5,
    node: (
      <img
        src="/img/slides/agents/codex.png"
        alt="Codex"
        className="h-[72px] w-auto object-contain"
      />
    ),
  },
  {
    key: 'v0',
    rotate: -2,
    y: 5,
    node: <V0Logo className="h-10 w-auto text-black" />,
  },
  {
    key: 'figma-make',
    rotate: 6,
    y: -3,
    node: <FigmaMakeLogo className="h-14 w-14" />,
  },
  {
    key: 'lovable',
    rotate: -4,
    y: 5,
    node: <LovableLogo className="h-14 w-14" />,
  },
  {
    key: 'replit',
    rotate: 4,
    y: -4,
    node: <ReplitLogo className="h-14 w-14" />,
  },
];

export function Slide9B() {
  // 6 agents evenly spaced under the prompt
  const agentCount = agentLogos.length;
  const cellW = AGENT_CELL_W;
  const gap = 16;
  const rowW = agentCount * cellW + (agentCount - 1) * gap; // 6*96 + 5*16 = 656
  const svgW = 800;
  const offset = (svgW - rowW) / 2;
  const endpoints = Array.from(
    { length: agentCount },
    (_, i) => offset + cellW / 2 + i * (cellW + gap),
  );

  return (
    <div
      className="relative flex overflow-hidden bg-[#FBF9F6]"
      style={{ width: SLIDE_W, height: SLIDE_H }}
    >
      <div
        className="pointer-events-none absolute"
        style={{
          top: '45%',
          left: '50%',
          width: 1100,
          height: 500,
          transform: 'translate(-50%, -50%)',
          background:
            'radial-gradient(ellipse at center, rgba(242,150,80,0.2) 0%, rgba(242,150,80,0.06) 50%, transparent 80%)',
        }}
      />
      <div className="relative z-10 flex h-full w-full flex-col items-center justify-center px-16">
        <h2 className="text-center text-[64px] leading-[1.15] font-normal tracking-tight">
          Works with <span className="text-orange-600">any agent</span>
        </h2>
        <p className="mt-4 text-center text-2xl text-gray-500">
          Add it to any prompt. Your agent provisions a full Instant DB.
        </p>

        <div className="mt-10 -rotate-[1deg]">
          <PromptBubble size="xl" text="Build my dream app." />
        </div>

        {/* Arrow fan going down to agents */}
        <svg
          className="mt-4"
          width={svgW}
          height="70"
          viewBox={`0 0 ${svgW} 70`}
          fill="none"
        >
          {endpoints.map((x) => (
            <path
              key={x}
              d={`M${svgW / 2} 0 Q ${svgW / 2} 35 ${x} 65`}
              stroke="#E5D8C7"
              strokeWidth="2"
              strokeDasharray="4 4"
            />
          ))}
        </svg>

        <div
          className="mt-2 flex items-center justify-center"
          style={{ gap }}
        >
          {agentLogos.map((a) => (
            <AgentLogoCell key={a.key}>
              <div
                style={{
                  transform: `translateY(${a.y}px) rotate(${a.rotate}deg)`,
                }}
              >
                {a.node}
              </div>
            </AgentLogoCell>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Variation C — Split: headline/subcopy left, terminal right
// ─────────────────────────────────────────────────────────

export function Slide9C() {
  return (
    <div
      className="relative flex overflow-hidden bg-[#FBF9F6]"
      style={{ width: SLIDE_W, height: SLIDE_H }}
    >
      <div
        className="pointer-events-none absolute"
        style={{
          top: '45%',
          left: '50%',
          width: 1100,
          height: 500,
          transform: 'translate(-50%, -50%)',
          background:
            'radial-gradient(ellipse at center, rgba(242,150,80,0.2) 0%, rgba(242,150,80,0.06) 50%, transparent 80%)',
        }}
      />
      <div className="relative z-10 flex h-full w-full items-center px-16">
        <div className="flex w-[460px] shrink-0 flex-col">
          <h2 className="text-[64px] leading-[1.1] font-normal tracking-tight">
            Any prompt,
            <br />
            <span className="text-orange-600">any backend</span>
          </h2>
          <p className="mt-5 max-w-[420px] text-xl text-gray-500">
            Drop{' '}
            <span
              className="rounded px-1.5 py-0.5 font-mono text-lg"
              style={{
                color: '#D97757',
                backgroundColor: 'rgba(217,119,87,0.12)',
              }}
            >
              Read getadb.com first
            </span>{' '}
            into any prompt and your agent provisions a full Instant DB:
            schema, auth, permissions, realtime, storage.
          </p>
        </div>

        <div
          className="ml-auto w-[620px]"
          style={{ transform: 'rotate(1.5deg)' }}
        >
          <AgentTerminal />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Variation D — "Sending" prompt — a single chat bubble
//   front and center, agent icon below receiving it
// ─────────────────────────────────────────────────────────

export function Slide9D() {
  return (
    <div
      className="relative flex overflow-hidden bg-[#FBF9F6]"
      style={{ width: SLIDE_W, height: SLIDE_H }}
    >
      <div
        className="pointer-events-none absolute"
        style={{
          top: '45%',
          left: '50%',
          width: 1100,
          height: 500,
          transform: 'translate(-50%, -50%)',
          background:
            'radial-gradient(ellipse at center, rgba(242,150,80,0.2) 0%, rgba(242,150,80,0.06) 50%, transparent 80%)',
        }}
      />
      <div className="relative z-10 flex h-full w-full flex-col items-center justify-center px-16">
        <h2 className="text-center text-[72px] leading-[1.15] font-normal tracking-tight">
          Turn any prompt into a
          <br />
          <span className="text-orange-600">full backend</span>
        </h2>

        {/* Chat-style conversation card */}
        <div className="mt-10 w-[720px] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
          {/* User row */}
          <div className="flex items-start gap-4 border-b border-gray-100 px-6 py-5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-sm font-semibold text-gray-500">
              S
            </div>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[22px] leading-snug text-gray-800">
              <span>Build me a todo app.</span>
              <span
                className="rounded-md px-2 py-0.5 font-medium"
                style={{
                  color: '#D97757',
                  backgroundColor: 'rgba(217,119,87,0.12)',
                }}
              >
                Read getadb.com first
              </span>
            </div>
          </div>
          {/* Agent row */}
          <div className="flex items-start gap-4 px-6 py-5">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: '#F3E1D4' }}
            >
              <ClaudeIcon className="h-4 w-4" style={{ color: '#D97757' }} />
            </div>
            <div className="space-y-1.5 text-[18px] text-gray-700">
              <div>
                Fetching setup rules from{' '}
                <span className="font-medium">getadb.com</span>...
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <span className="text-green-600">✓</span> Provisioned Instant
                DB
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <span className="text-green-600">✓</span> Schema, auth,
                permissions ready
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Variation E — The directive as the hero (minimal)
// ─────────────────────────────────────────────────────────

export function Slide9E() {
  return (
    <div
      className="relative flex overflow-hidden bg-[#FBF9F6]"
      style={{ width: SLIDE_W, height: SLIDE_H }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'linear-gradient(#9a8c7a 1px, transparent 1px), linear-gradient(90deg, #9a8c7a 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />
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
        <p className="text-center text-2xl text-gray-500">
          Add this to any prompt
        </p>
        <p className="mt-6 font-mono text-[72px] font-normal tracking-tight text-black">
          Read{' '}
          <span className="text-orange-600" style={{ fontWeight: 500 }}>
            getadb.com
          </span>{' '}
          first
        </p>
        <p className="mt-8 max-w-2xl text-center text-2xl text-gray-500">
          Your agent will provision a full Instant DB: schema, auth,
          permissions, realtime, and storage.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Variation F — Prompt card "floating" with a highlighted
//   pill, smaller agent terminal peeking below
// ─────────────────────────────────────────────────────────

export function Slide9F() {
  return (
    <div
      className="relative flex overflow-hidden bg-[#FBF9F6]"
      style={{ width: SLIDE_W, height: SLIDE_H }}
    >
      <div
        className="pointer-events-none absolute"
        style={{
          top: '45%',
          left: '50%',
          width: 1100,
          height: 500,
          transform: 'translate(-50%, -50%)',
          background:
            'radial-gradient(ellipse at center, rgba(242,150,80,0.2) 0%, rgba(242,150,80,0.06) 50%, transparent 80%)',
        }}
      />
      <div className="relative z-10 flex h-full w-full flex-col items-center px-16 pt-16">
        <h2 className="text-center text-[64px] leading-[1.15] font-normal tracking-tight">
          Any prompt becomes a{' '}
          <span className="text-orange-600">backend</span>
        </h2>
        <p className="mt-4 text-center text-2xl text-gray-500">
          Drop{' '}
          <span className="font-mono text-orange-600">Read getadb.com first</span>{' '}
          into your prompt. We'll do the rest.
        </p>

        {/* Stacked cards — prompt floats above a terminal */}
        <div className="relative mt-12" style={{ width: 760, height: 280 }}>
          <div className="absolute top-14 left-1/2 w-[640px] -translate-x-1/2 rotate-[1.5deg]">
            <AgentTerminal />
          </div>
          <div
            className="absolute -top-2 left-1/2 -translate-x-1/2 -rotate-[2deg]"
            style={{ zIndex: 10 }}
          >
            <PromptBubble size="md" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────

export default function Slide9Page() {
  return (
    <div className="flex min-h-screen flex-col items-start gap-16 bg-gray-100 p-12">
      <h1 className="text-2xl font-medium text-gray-500">
        Slide 9 — Read getadb.com first
      </h1>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-gray-400">A — Terminal hero</p>
        <SlidePreview>
          <Slide9A />
        </SlidePreview>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-gray-400">
          B — Prompt bubble fanning out to agents
        </p>
        <SlidePreview>
          <Slide9B />
        </SlidePreview>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-gray-400">
          C — Split: headline left, terminal right
        </p>
        <SlidePreview>
          <Slide9C />
        </SlidePreview>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-gray-400">
          D — Chat conversation card
        </p>
        <SlidePreview>
          <Slide9D />
        </SlidePreview>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-gray-400">
          E — Directive as hero
        </p>
        <SlidePreview>
          <Slide9E />
        </SlidePreview>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-gray-400">
          F — Prompt floating above terminal
        </p>
        <SlidePreview>
          <Slide9F />
        </SlidePreview>
      </div>
    </div>
  );
}
