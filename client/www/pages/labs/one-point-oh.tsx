import Head from "next/head";

const FRAME_BG = "/img/landing/video-frame.png";

// ─── 1. The Mobile ──────────────────────────────────────────────────────────
// A wire sweeps across the frame. "1.0" hangs from it like a Calder mobile.
function TheMobile() {
  return (
    <>
      {/* The wire */}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 1600 900"
        preserveAspectRatio="none"
        fill="none"
      >
        <path
          d="M1600 120 Q1200 40 1050 280"
          stroke="#ea580c"
          strokeWidth="3"
        />
        <path
          d="M1050 280 L1050 420"
          stroke="#ea580c"
          strokeWidth="3"
        />
        {/* small balancing arm */}
        <path
          d="M980 420 L1120 420"
          stroke="#ea580c"
          strokeWidth="3"
        />
        {/* hanging threads */}
        <path d="M990 420 L990 500" stroke="#ea580c" strokeWidth="2" />
        <path d="M1110 420 L1110 480" stroke="#ea580c" strokeWidth="2" />
      </svg>
      {/* Hanging shapes */}
      <div
        className="absolute"
        style={{ top: "55%", right: "33%" }}
      >
        <div className="h-[clamp(28px,4vw,56px)] w-[clamp(28px,4vw,56px)] rounded-full bg-[#ea580c]" />
      </div>
      <div
        className="absolute flex items-center justify-center"
        style={{ top: "52%", right: "26%" }}
      >
        <span className="font-mono text-[clamp(18px,2.2vw,36px)] font-bold text-white">
          1.0
        </span>
      </div>
    </>
  );
}

// ─── 2. Big Red Dot ─────────────────────────────────────────────────────────
// One massive orange circle, partially offscreen. "1.0" inside it.
// Bold, unapologetic. The circle IS the statement.
function BigRedDot() {
  return (
    <div
      className="absolute flex items-center justify-center rounded-full bg-[#ea580c]"
      style={{
        width: "clamp(180px, 28vw, 420px)",
        height: "clamp(180px, 28vw, 420px)",
        top: "-8%",
        right: "-5%",
      }}
    >
      <span
        className="mt-[15%] ml-[-10%] font-mono text-[clamp(36px,5vw,90px)] font-bold text-white"
      >
        1.0
      </span>
    </div>
  );
}

// ─── 3. Stabile ─────────────────────────────────────────────────────────────
// Bold abstract shapes anchored at the bottom-right, like a Calder stabile.
function Stabile() {
  return (
    <>
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 1600 900"
        preserveAspectRatio="none"
        fill="none"
      >
        {/* Main triangular form */}
        <polygon
          points="1350,900 1100,900 1250,550"
          fill="#ea580c"
        />
        {/* Second leg */}
        <polygon
          points="1500,900 1350,900 1300,620"
          fill="#070b1b"
        />
        {/* Floating circle */}
        <circle cx="1220" cy="480" r="45" fill="#ea580c" />
      </svg>
      <div
        className="absolute"
        style={{ bottom: "28%", right: "14%" }}
      >
        <span
          className="font-mono text-[clamp(20px,2.5vw,44px)] font-bold text-white"
          style={{ textShadow: "0 2px 12px rgba(0,0,0,0.3)" }}
        >
          1.0
        </span>
      </div>
    </>
  );
}

// ─── 4. The Arc ─────────────────────────────────────────────────────────────
// A single confident arc of orange sweeping across the top-right.
// "1.0" sits where the arc is thickest. Gesture, not decoration.
function TheArc() {
  return (
    <>
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 1600 900"
        preserveAspectRatio="none"
        fill="none"
      >
        <path
          d="M900 -100 Q1500 200 1650 700"
          stroke="#ea580c"
          strokeWidth="60"
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute top-[18%] right-[8%]">
        <span
          className="font-mono text-[clamp(28px,3.5vw,60px)] font-bold text-white"
          style={{ textShadow: "0 2px 16px rgba(0,0,0,0.4)" }}
        >
          1.0
        </span>
      </div>
    </>
  );
}

// ─── 5. Counterweight ───────────────────────────────────────────────────────
// Two shapes in tension. A black rectangle and an orange circle,
// connected by a thin line. "1.0" on the circle. Balance.
function Counterweight() {
  return (
    <>
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 1600 900"
        preserveAspectRatio="none"
        fill="none"
      >
        {/* Wire */}
        <line
          x1="1050" y1="100"
          x2="1350" y2="100"
          stroke="white"
          strokeWidth="2"
        />
        {/* Fulcrum */}
        <line
          x1="1200" y1="0"
          x2="1200" y2="100"
          stroke="white"
          strokeWidth="2"
        />
        {/* Left drop */}
        <line
          x1="1050" y1="100"
          x2="1050" y2="220"
          stroke="white"
          strokeWidth="2"
        />
        {/* Right drop */}
        <line
          x1="1350" y1="100"
          x2="1350" y2="180"
          stroke="white"
          strokeWidth="2"
        />
        {/* Black rectangle - the weight */}
        <rect
          x="1010" y="220"
          width="80" height="100"
          fill="#070b1b"
        />
        {/* Orange circle */}
        <circle cx="1350" cy="240" r="60" fill="#ea580c" />
      </svg>
      <div
        className="absolute"
        style={{ top: "22%", right: "10.5%", transform: "translateX(50%)" }}
      >
        <span className="font-mono text-[clamp(16px,1.8vw,28px)] font-bold text-white">
          1.0
        </span>
      </div>
    </>
  );
}

const DESIGNS = [
  {
    name: "1. The Mobile",
    description:
      "A wire sweeps in from offscreen. 1.0 hangs from it with a red disc as counterweight.",
    Component: TheMobile,
  },
  {
    name: "2. Big Red Dot",
    description:
      "One massive orange circle bleeds off the top-right. 1.0 inside. Bold, unapologetic.",
    Component: BigRedDot,
  },
  {
    name: "3. Stabile",
    description:
      "Abstract triangular forms anchored at the bottom-right. A floating orange disc above.",
    Component: Stabile,
  },
  {
    name: "4. The Arc",
    description:
      "A single confident brushstroke of orange sweeping across. Gesture, not decoration.",
    Component: TheArc,
  },
  {
    name: "5. Counterweight",
    description:
      "Two shapes in balance on a wire. Black rectangle vs orange circle. Tension and poise.",
    Component: Counterweight,
  },
];

export default function OnePointOhPage() {
  return (
    <>
      <Head>
        <title>instant 1.0 — v4 (Calder)</title>
      </Head>
      <div className="min-h-screen bg-black p-8 text-white">
        <div className="mx-auto max-w-7xl">
          <h1 className="mb-10 text-2xl font-bold">
            instant 1.0 — v4
          </h1>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            {DESIGNS.map((design) => (
              <div
                key={design.name}
                className="overflow-hidden rounded-xl border border-white/10"
              >
                <div
                  className="relative overflow-hidden"
                  style={{ aspectRatio: "16/9" }}
                >
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
