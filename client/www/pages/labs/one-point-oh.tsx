import Head from "next/head";

const FRAME_BG = "/img/landing/video-frame.png";

function InstantLogo({ className }: { className?: string }) {
  return (
    <div className={`inline-flex items-center gap-2 ${className || ""}`}>
      <div className="flex h-7 w-7 items-center justify-center rounded bg-[#070b1b]">
        <span className="text-sm font-bold text-white">I</span>
      </div>
      <span className="text-lg font-semibold tracking-tight">instant</span>
    </div>
  );
}

// ─── Design 1: Terminal Style ────────────────────────────────────────────────
// Leans into the developer CLI vibe (npx create-instant-app)
function TerminalStyle() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="rounded-xl border border-white/20 bg-black/80 px-8 py-5 font-mono backdrop-blur-sm">
        <div className="flex items-center gap-2 text-sm text-white/50">
          <span className="text-orange-500">$</span>
          <span>npx create-instant-app</span>
        </div>
        <div className="mt-3 text-3xl font-bold text-white sm:text-4xl">
          v1.0<span className="animate-pulse text-orange-500">_</span>
        </div>
        <div className="mt-1 text-sm text-white/50">ready for production</div>
      </div>
    </div>
  );
}

// ─── Design 2: Shipping Label / Stamp ────────────────────────────────────────
// Playful "we shipped it" energy
function ShippingStamp() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="rotate-[-6deg]">
        <div className="rounded-lg border-4 border-orange-500 px-8 py-4 text-center">
          <div className="text-xs font-bold tracking-[0.25em] text-orange-500">
            NOW SHIPPING
          </div>
          <div className="mt-1 text-4xl font-bold text-white sm:text-5xl">
            instant 1.0
          </div>
          <div className="mt-1 text-xs tracking-[0.2em] text-white/60">
            HANDLE WITH CONFIDENCE
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Design 3: Changelog / Version Badge ─────────────────────────────────────
// Clean, minimal, on-brand with the site's pill/badge style
function VersionBadge() {
  return (
    <div className="absolute inset-0 flex items-center justify-end pr-[8%]">
      <div className="text-right">
        <div className="inline-flex items-center gap-2 rounded-full bg-orange-500/20 px-3 py-1 text-xs font-medium text-orange-400">
          <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
          NEW RELEASE
        </div>
        <div className="mt-3 text-5xl font-bold tracking-tight text-white sm:text-6xl">
          1.0
        </div>
        <div className="mt-2 text-base text-white/70">
          The best backend for
          <br />
          AI-coded apps is ready.
        </div>
      </div>
    </div>
  );
}

// ─── Design 4: Scoreboard / Counter ──────────────────────────────────────────
// Plays on the "rolling number" counter from the homepage
function ScoreboardCounter() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="text-center">
        <div className="font-mono text-sm tracking-widest text-white/50">
          VERSION
        </div>
        <div className="mt-2 flex items-baseline justify-center gap-1">
          {["1", ".", "0"].map((char, i) => (
            <div
              key={i}
              className={
                char === "."
                  ? "text-5xl font-bold text-orange-500 sm:text-7xl"
                  : "rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-5xl font-bold text-white backdrop-blur-sm sm:text-7xl"
              }
            >
              {char}
            </div>
          ))}
        </div>
        <div className="mt-3 text-sm text-white/50">
          Ship something delightful
        </div>
      </div>
    </div>
  );
}

// ─── Design 5: Minimal / Hero Style ──────────────────────────────────────────
// Matches the homepage hero typography exactly
function MinimalHero() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl font-normal text-white sm:text-5xl">
          Introducing
        </div>
        <div className="mt-2 text-4xl font-normal text-white sm:text-5xl">
          instant{" "}
          <span className="font-semibold text-orange-500">1.0</span>
        </div>
      </div>
    </div>
  );
}

const DESIGNS = [
  {
    name: "1. Terminal / CLI",
    description:
      'Leans into the developer aesthetic. The blinking cursor says "just shipped."',
    Component: TerminalStyle,
  },
  {
    name: "2. Shipping Stamp",
    description:
      'Playful rotated stamp. "Handle with confidence" is a nice touch.',
    Component: ShippingStamp,
  },
  {
    name: "3. Version Badge",
    description:
      "Clean badge + large 1.0. Uses the orange pill style from the site. Right-aligned so Stopa is visible.",
    Component: VersionBadge,
  },
  {
    name: "4. Scoreboard Counter",
    description:
      'Plays on the rolling number counters from the homepage. "Ship something delightful" is the homepage CTA.',
    Component: ScoreboardCounter,
  },
  {
    name: "5. Minimal Hero",
    description:
      "Matches the homepage hero typography exactly. Lets the orange 1.0 do all the talking.",
    Component: MinimalHero,
  },
];

export default function OnePointOhPage() {
  return (
    <>
      <Head>
        <title>instant 1.0 Design Options</title>
      </Head>
      <div className="min-h-screen bg-black p-8 text-white">
        <div className="mx-auto max-w-7xl">
          <h1 className="mb-10 text-2xl font-bold">
            instant 1.0 — Design Options
          </h1>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            {DESIGNS.map((design) => (
              <div
                key={design.name}
                className="overflow-hidden rounded-xl border border-white/10"
              >
                <div
                  className="relative"
                  style={{ aspectRatio: "16/9" }}
                >
                  <img
                    src={FRAME_BG}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/50" />
                  <design.Component />
                </div>
                <div className="p-4">
                  <h2 className="text-lg font-semibold">{design.name}</h2>
                  <p className="mt-1 text-sm text-white/60">
                    {design.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
