"use client";

import { useState, useRef, useEffect } from "react";

type Rankings = {
  codex: number;
  claude: number;
  gemini: number;
};

type Category = {
  name: string;
  rankings51: Rankings;
  rankings52: Rankings;
};

const frontendCategories: Category[] = [
  {
    name: "Boxes + Physics",
    rankings51: { codex: 3, claude: 1, gemini: 2 },
    rankings52: { codex: 2, claude: 1, gemini: 2 },
  },
  {
    name: "Characters + guns",
    rankings51: { codex: 3, claude: 1, gemini: 2 },
    rankings52: { codex: 2, claude: 1, gemini: 2 },
  },
  {
    name: "POV gun",
    rankings51: { codex: 2, claude: 1, gemini: 3 },
    rankings52: { codex: 2, claude: 1, gemini: 3 },
  },
  {
    name: "Sounds",
    rankings51: { codex: 2, claude: 1, gemini: 3 },
    rankings52: { codex: 2, claude: 1, gemini: 3 },
  },
];

const backendCategories: Category[] = [
  {
    name: "Moving",
    rankings51: { codex: 2, claude: 3, gemini: 1 },
    rankings52: { codex: 1, claude: 3, gemini: 1 },
  },
  {
    name: "Shooting",
    rankings51: { codex: 3, claude: 1, gemini: 2 },
    rankings52: { codex: 1, claude: 1, gemini: 3 },
  },
  {
    name: "Saving rooms",
    rankings51: { codex: 2, claude: 3, gemini: 1 },
    rankings52: { codex: 2, claude: 3, gemini: 1 },
  },
];

const bonusCategory: Category = {
  name: "Bonus",
  rankings51: { codex: 2, claude: 3, gemini: 1 },
  rankings52: { codex: 1, claude: 3, gemini: 1 },
};

type AIName = "codex" | "claude" | "gemini";

const aiLogos: Record<AIName, string> = {
  claude:
    "https://uxwing.com/wp-content/themes/uxwing/download/brands-and-social-media/claude-ai-icon.svg",
  gemini:
    "https://uxwing.com/wp-content/themes/uxwing/download/brands-and-social-media/google-gemini-icon.svg",
  codex: "https://www.svgrepo.com/show/306500/openai.svg",
};

const aiLabels: Record<AIName, string> = {
  codex: "Codex",
  claude: "Claude",
  gemini: "Gemini",
};

function AIBadge({ ai, style }: { ai: AIName; style?: React.CSSProperties }) {
  return (
    <div
      className="absolute flex items-center justify-center transition-all duration-700 ease-out"
      style={style}
    >
      <div className="w-7 h-7 rounded-sm bg-white dark:bg-neutral-700 flex items-center justify-center p-1 border border-gray-200 dark:border-neutral-600">
        <img
          src={aiLogos[ai]}
          alt={aiLabels[ai]}
          className="w-full h-full object-contain dark:invert dark:brightness-200"
        />
      </div>
    </div>
  );
}

function ScoreRow({
  category,
  isVersion52,
  columnRefs,
}: {
  category: Category;
  isVersion52: boolean;
  columnRefs: React.RefObject<(HTMLDivElement | null)[]>;
}) {
  const rankings = isVersion52 ? category.rankings52 : category.rankings51;
  const rowRef = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<
    Record<AIName, { left: number; top: number }>
  >({
    codex: { left: 0, top: 0 },
    claude: { left: 0, top: 0 },
    gemini: { left: 0, top: 0 },
  });

  useEffect(() => {
    const calculatePositions = () => {
      if (!rowRef.current || !columnRefs.current) return;

      const rowRect = rowRef.current.getBoundingClientRect();
      const newPositions: Record<AIName, { left: number; top: number }> = {
        codex: { left: 0, top: 0 },
        claude: { left: 0, top: 0 },
        gemini: { left: 0, top: 0 },
      };

      const aisAtPosition: Record<number, AIName[]> = { 1: [], 2: [], 3: [] };
      (["codex", "claude", "gemini"] as AIName[]).forEach((ai) => {
        const pos = rankings[ai];
        aisAtPosition[pos].push(ai);
      });

      (["codex", "claude", "gemini"] as AIName[]).forEach((ai) => {
        const pos = rankings[ai];
        const colEl = columnRefs.current?.[pos];
        if (!colEl) return;

        const colRect = colEl.getBoundingClientRect();
        const aisHere = aisAtPosition[pos];
        const indexInGroup = aisHere.indexOf(ai);
        const totalInGroup = aisHere.length;

        const badgeSize = 28;
        const horizontalSpacing = 20;
        const baseTop = 10;

        // Calculate horizontal offset for ties (stack side by side)
        let offsetX = 0;
        if (totalInGroup === 2) {
          offsetX = indexInGroup === 0 ? -horizontalSpacing / 2 : horizontalSpacing / 2;
        } else if (totalInGroup === 3) {
          offsetX = (indexInGroup - 1) * horizontalSpacing;
        }

        newPositions[ai] = {
          left:
            colRect.left - rowRect.left + colRect.width / 2 - badgeSize / 2 + offsetX,
          top: baseTop,
        };
      });

      setPositions(newPositions);
    };

    calculatePositions();
    window.addEventListener("resize", calculatePositions);
    return () => window.removeEventListener("resize", calculatePositions);
  }, [rankings, columnRefs]);

  return (
    <div
      ref={rowRef}
      className="flex border-b border-gray-100 dark:border-neutral-700 relative h-12"
    >
      <div className="py-2 px-4 text-gray-700 dark:text-neutral-300 font-mono text-sm w-40 flex items-center">
        {category.name}
      </div>
      <div className="py-2 px-2 w-20 flex-shrink-0"></div>
      <div className="py-2 px-2 w-20 flex-shrink-0"></div>
      <div className="py-2 px-2 w-20 flex-shrink-0"></div>
      {(["codex", "claude", "gemini"] as AIName[]).map((ai) => (
        <AIBadge
          key={ai}
          ai={ai}
          style={{
            left: positions[ai].left,
            top: positions[ai].top,
          }}
        />
      ))}
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="bg-gray-50 dark:bg-neutral-800 py-1.5 px-4">
      <span className="font-mono font-bold text-gray-900 dark:text-white text-xs uppercase tracking-wider">
        {title}
      </span>
    </div>
  );
}

export function GPT52Leaderboard() {
  const [isVersion52, setIsVersion52] = useState(false);
  const columnRefs = useRef<(HTMLDivElement | null)[]>([
    null,
    null,
    null,
    null,
  ]);

  const handleToggle = () => {
    setIsVersion52(!isVersion52);
  };

  const currentModel = isVersion52 ? "GPT 5.2" : "Codex 5.1 Max";
  const otherModel = isVersion52 ? "Codex 5.1 Max" : "GPT 5.2";

  return (
    <div className="flex flex-col items-center py-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between w-full max-w-[500px]">
        <div className="font-mono text-base text-gray-700 dark:text-neutral-300">
          Current Model:{" "}
          <span className="font-bold text-gray-900 dark:text-white">
            {currentModel}
          </span>
        </div>
        <button
          onClick={handleToggle}
          className={`font-mono text-sm font-bold px-4 py-1.5 rounded-sm transition-colors duration-200 border ${
            isVersion52
              ? "bg-white dark:bg-neutral-700 text-gray-700 dark:text-neutral-200 border-gray-200 dark:border-neutral-600 hover:bg-gray-50 dark:hover:bg-neutral-600"
              : "bg-[#606AF4] text-white border-[#606AF4] hover:bg-[#4543e9] hover:border-[#4543e9]"
          }`}
        >
          See {otherModel}
        </button>
      </div>

      {/* Scorecard */}
      <div className="bg-white dark:bg-neutral-800 rounded-sm border border-gray-200 dark:border-neutral-700 overflow-hidden w-full max-w-[500px]">
        {/* Header row */}
        <div className="flex border-b border-gray-200 dark:border-neutral-700">
          <div className="py-2 px-4 w-40"></div>
          <div
            ref={(el) => {
              columnRefs.current[1] = el;
            }}
            className="py-2 px-2 w-20 flex-shrink-0 flex items-center justify-center"
          >
            <span className="text-3xl">🥇</span>
          </div>
          <div
            ref={(el) => {
              columnRefs.current[2] = el;
            }}
            className="py-2 px-2 w-20 flex-shrink-0 flex items-center justify-center"
          >
            <span className="text-3xl">🥈</span>
          </div>
          <div
            ref={(el) => {
              columnRefs.current[3] = el;
            }}
            className="py-2 px-2 w-20 flex-shrink-0 flex items-center justify-center"
          >
            <span className="text-3xl">🥉</span>
          </div>
        </div>

        {/* Frontend section */}
        <SectionHeader title="Frontend" />
        {frontendCategories.map((category) => (
          <ScoreRow
            key={category.name}
            category={category}
            isVersion52={isVersion52}
            columnRefs={columnRefs}
          />
        ))}

        {/* Backend section */}
        <SectionHeader title="Backend" />
        {backendCategories.map((category) => (
          <ScoreRow
            key={category.name}
            category={category}
            isVersion52={isVersion52}
            columnRefs={columnRefs}
          />
        ))}

        {/* Bonus section */}
        <SectionHeader title="Bonus" />
        <ScoreRow
          category={bonusCategory}
          isVersion52={isVersion52}
          columnRefs={columnRefs}
        />
      </div>
    </div>
  );
}
