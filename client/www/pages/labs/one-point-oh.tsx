import Head from "next/head";

const FRAME_BG = "/img/landing/video-frame.png";

// ─── 1. Just the number ─────────────────────────────────────────────────────
// Dieter Rams: if you can remove it, remove it. Just "1.0" on the wall.
function JustTheNumber() {
  return (
    <div className="absolute top-[12%] right-[7%]">
      <span
        className="font-mono text-[clamp(32px,4vw,72px)] font-semibold tracking-tight text-white"
        style={{ textShadow: "0 2px 20px rgba(0,0,0,0.4)" }}
      >
        1.0
      </span>
    </div>
  );
}

// ─── 2. Lower third ─────────────────────────────────────────────────────────
// Like a film credit. One line, bottom edge, small type.
function LowerThird() {
  return (
    <div className="absolute right-0 bottom-[6%] left-0 px-[5%]">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-white/30" />
        <span
          className="font-mono text-[clamp(11px,1vw,16px)] tracking-[0.15em] text-white/90"
          style={{ textShadow: "0 1px 8px rgba(0,0,0,0.5)" }}
        >
          instant 1.0
        </span>
      </div>
    </div>
  );
}

// ─── 3. Corner mark ─────────────────────────────────────────────────────────
// Like a page number in a book. Top-right, tiny, almost hidden.
function CornerMark() {
  return (
    <div className="absolute top-[5%] right-[5%]">
      <span
        className="font-mono text-[clamp(10px,0.9vw,14px)] tracking-[0.2em] text-white/80"
        style={{ textShadow: "0 1px 8px rgba(0,0,0,0.5)" }}
      >
        INSTANT 1.0
      </span>
    </div>
  );
}

// ─── 4. Wall projection ─────────────────────────────────────────────────────
// Large but light, as if projected on the concrete wall behind the speaker.
function WallProjection() {
  return (
    <div className="absolute top-[8%] right-[5%]">
      <span
        className="text-[clamp(40px,5.5vw,96px)] font-semibold tracking-tight text-white/40"
      >
        1.0
      </span>
    </div>
  );
}

// ─── 5. Inline with speaker ─────────────────────────────────────────────────
// Small text on the right, vertically centered, like a caption beside the subject.
function InlineCaption() {
  return (
    <div className="absolute top-[15%] right-[6%]">
      <div
        className="font-mono text-[clamp(10px,0.85vw,14px)] leading-relaxed tracking-wide text-white/80"
        style={{ textShadow: "0 1px 8px rgba(0,0,0,0.5)" }}
      >
        <div>instant</div>
        <div className="mt-1 text-[clamp(20px,2.5vw,42px)] font-semibold tracking-tight text-white">
          1.0
        </div>
      </div>
    </div>
  );
}

const DESIGNS = [
  {
    name: "1. Just the number",
    description: "Nothing else. 1.0 on the wall. The video says the rest.",
    Component: JustTheNumber,
  },
  {
    name: "2. Lower third",
    description:
      "A thin line and small mono type at the bottom edge. Like a film credit.",
    Component: LowerThird,
  },
  {
    name: "3. Corner mark",
    description:
      "Tiny all-caps in the corner. Like a page number. Almost missable.",
    Component: CornerMark,
  },
  {
    name: "4. Wall projection",
    description:
      "Large but ghosted. Feels like it is part of the wall behind.",
    Component: WallProjection,
  },
  {
    name: "5. Inline caption",
    description:
      'Small "instant" label with a bigger 1.0 beneath it. Top-right, out of the way.',
    Component: InlineCaption,
  },
];

export default function OnePointOhPage() {
  return (
    <>
      <Head>
        <title>instant 1.0 — v3</title>
      </Head>
      <div className="min-h-screen bg-black p-8 text-white">
        <div className="mx-auto max-w-7xl">
          <h1 className="mb-10 text-2xl font-bold">
            instant 1.0 — v3
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
