import Head from "next/head";

const FRAME_BG = "/img/landing/video-frame.png";

function InstantLogoIcon({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="512" height="512" fill="black" />
      <rect x="97.0973" y="91.3297" width="140" height="330" fill="white" />
    </svg>
  );
}

// ─── Design 1: Present Box ──────────────────────────────────────────────────
// Orange box with ribbon/bow, logo + "instant" in mono inside
function PresentBox() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="relative">
        {/* Ribbon vertical */}
        <div className="absolute top-0 bottom-0 left-1/2 w-[6px] -translate-x-1/2 bg-orange-400" />
        {/* Ribbon horizontal */}
        <div className="absolute top-1/2 right-0 left-0 h-[6px] -translate-y-1/2 bg-orange-400" />
        {/* Bow */}
        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
          <div className="flex items-end gap-0.5">
            <div className="h-4 w-6 rounded-tl-full border-2 border-orange-400 bg-transparent" />
            <div className="h-4 w-6 rounded-tr-full border-2 border-orange-400 bg-transparent" />
          </div>
        </div>
        {/* Box */}
        <div className="rounded-lg border-[3px] border-orange-500 bg-[#070b1b]/90 px-10 py-7 text-center backdrop-blur-sm">
          <div className="flex items-center justify-center gap-2.5">
            <InstantLogoIcon size={24} />
            <span className="font-mono text-lg text-white">instant</span>
          </div>
          <div className="mt-3 text-4xl font-bold tracking-tight text-white sm:text-5xl">
            1.0
          </div>
          <div className="mt-2 text-xs font-bold tracking-[0.25em] text-orange-500">
            NOW SHIPPING
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Design 2: Present Box (alt - more gift-like) ───────────────────────────
// Thicker ribbon, rounder, more playful
function PresentBoxAlt() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="relative">
        {/* Ribbon vertical */}
        <div className="absolute top-0 bottom-0 left-1/2 w-3 -translate-x-1/2 bg-orange-500/80" />
        {/* Ribbon horizontal */}
        <div className="absolute top-1/2 right-0 left-0 h-3 -translate-y-1/2 bg-orange-500/80" />
        {/* Bow loops */}
        <div className="absolute -top-5 left-1/2 z-10 -translate-x-1/2">
          <div className="flex items-end">
            <div className="h-5 w-8 -rotate-12 rounded-full border-[3px] border-orange-500 bg-orange-500/20" />
            <div className="h-5 w-8 rotate-12 rounded-full border-[3px] border-orange-500 bg-orange-500/20" />
          </div>
        </div>
        {/* Box */}
        <div className="relative rounded-xl border-[3px] border-orange-500 bg-[#070b1b]/90 px-12 py-8 text-center backdrop-blur-sm">
          <div className="flex items-center justify-center gap-2.5">
            <InstantLogoIcon size={22} />
            <span className="font-mono text-base text-white/80">instant</span>
          </div>
          <div className="mt-2 text-5xl font-bold tracking-tight text-white sm:text-6xl">
            1.0
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Design 3: Minimal Hero (side-aligned) ──────────────────────────────────
// Left-aligned, smaller, subtle
function MinimalHeroSide() {
  return (
    <div className="absolute inset-0 flex items-end justify-start p-[6%]">
      <div className="text-left">
        <div className="text-xl font-normal text-white sm:text-2xl">
          Introducing
        </div>
        <div className="mt-1 text-xl font-normal text-white sm:text-2xl">
          instant{" "}
          <span className="font-semibold text-orange-500">1.0</span>
        </div>
      </div>
    </div>
  );
}

// ─── Design 4: Minimal Hero (side, top-right) ───────────────────────────────
// Right-aligned at top, like a quiet label
function MinimalHeroTopRight() {
  return (
    <div className="absolute inset-0 flex items-start justify-end p-[6%]">
      <div className="text-right">
        <div className="text-xl font-normal text-white sm:text-2xl">
          Introducing
        </div>
        <div className="mt-1 text-xl font-normal text-white sm:text-2xl">
          instant{" "}
          <span className="font-semibold text-orange-500">1.0</span>
        </div>
      </div>
    </div>
  );
}

// ─── Design 5: Version Badge with Logo Icon ─────────────────────────────────
// Logo icon instead of "NEW RELEASE" pill
function VersionBadgeLogo() {
  return (
    <div className="absolute inset-0 flex items-center justify-end pr-[8%]">
      <div className="text-right">
        <InstantLogoIcon size={32} />
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

const DESIGNS = [
  {
    name: "1. Present Box",
    description:
      "Orange gift box with ribbon and bow. Logo + instant in mono inside, NOW SHIPPING below.",
    Component: PresentBox,
  },
  {
    name: "2. Present Box (alt)",
    description:
      "Rounder, more playful gift box variant. Bigger 1.0, slightly different bow style.",
    Component: PresentBoxAlt,
  },
  {
    name: "3. Minimal Hero (bottom-left)",
    description:
      'Small, left-aligned "Introducing instant 1.0" at bottom-left. Quiet and editorial.',
    Component: MinimalHeroSide,
  },
  {
    name: "4. Minimal Hero (top-right)",
    description:
      "Same minimal text but top-right. Leaves Stopa fully visible.",
    Component: MinimalHeroTopRight,
  },
  {
    name: "5. Version Badge + Logo",
    description:
      "Logo icon replaces the NEW RELEASE pill. Clean right-aligned layout.",
    Component: VersionBadgeLogo,
  },
];

export default function OnePointOhPage() {
  return (
    <>
      <Head>
        <title>instant 1.0 Design Options v2</title>
      </Head>
      <div className="min-h-screen bg-black p-8 text-white">
        <div className="mx-auto max-w-7xl">
          <h1 className="mb-10 text-2xl font-bold">
            instant 1.0 — Design Options v2
          </h1>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            {DESIGNS.map((design) => (
              <div
                key={design.name}
                className="overflow-hidden rounded-xl border border-white/10"
              >
                <div className="relative" style={{ aspectRatio: "16/9" }}>
                  <img
                    src={FRAME_BG}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                  />
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
