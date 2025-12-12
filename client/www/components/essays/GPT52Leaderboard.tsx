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
      <div className="w-9 h-9 rounded-full bg-white shadow-md flex items-center justify-center p-2 border border-gray-200">
        <img
          src={aiLogos[ai]}
          alt={aiLabels[ai]}
          className="w-full h-full object-contain"
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
  columnRefs: React.RefObject<(HTMLTableCellElement | null)[]>;
}) {
  const rankings = isVersion52 ? category.rankings52 : category.rankings51;
  const rowRef = useRef<HTMLTableRowElement>(null);
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

        const badgeSize = 36;
        const verticalSpacing = 20;
        const baseTop = 14;

        let offsetY = 0;
        if (totalInGroup === 2) {
          offsetY = indexInGroup === 0 ? -verticalSpacing / 2 : verticalSpacing / 2;
        } else if (totalInGroup === 3) {
          offsetY = (indexInGroup - 1) * verticalSpacing;
        }

        newPositions[ai] = {
          left: colRect.left - rowRect.left + colRect.width / 2 - badgeSize / 2,
          top: baseTop + offsetY,
        };
      });

      setPositions(newPositions);
    };

    calculatePositions();
    window.addEventListener("resize", calculatePositions);
    return () => window.removeEventListener("resize", calculatePositions);
  }, [rankings, columnRefs]);

  return (
    <tr ref={rowRef} className="border-b border-gray-100 relative h-16">
      <td className="py-4 px-8 text-gray-700">{category.name}</td>
      <td className="py-4 px-4"></td>
      <td className="py-4 px-4"></td>
      <td className="py-4 px-4"></td>
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
    </tr>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <tr className="bg-gray-50">
      <td colSpan={4} className="py-2.5 px-8">
        <span className="font-semibold text-gray-900 text-sm">{title}</span>
      </td>
    </tr>
  );
}

export function GPT52Leaderboard() {
  const [isVersion52, setIsVersion52] = useState(false);
  const columnRefs = useRef<(HTMLTableCellElement | null)[]>([
    null,
    null,
    null,
    null,
  ]);

  const handleToggle = () => {
    setIsVersion52(!isVersion52);
  };

  return (
    <div className="flex flex-col items-center py-8">
      {/* Header */}
      <div className="mb-8 text-center">
        <button
          onClick={handleToggle}
          className="text-4xl font-bold text-gray-900 hover:text-gray-600 transition-colors duration-200 cursor-pointer"
        >
          {isVersion52 ? "GPT 5.2" : "Codex 5.1 Max"}
        </button>
      </div>

      {/* Legend */}
      <div className="flex gap-6 mb-4">
        {(["claude", "codex", "gemini"] as AIName[]).map((ai) => (
          <div key={ai} className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-white shadow-sm flex items-center justify-center p-1 border border-gray-200">
              <img
                src={aiLogos[ai]}
                alt={aiLabels[ai]}
                className="w-full h-full object-contain"
              />
            </div>
            <span className="text-sm text-gray-600">{aiLabels[ai]}</span>
          </div>
        ))}
      </div>

      {/* Scorecard Table */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden w-full max-w-[600px]">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="py-6 px-8 text-left w-52"></th>
              <th
                ref={(el) => {
                  columnRefs.current[1] = el;
                }}
                className="py-6 px-4 text-center w-28"
              >
                <span className="text-5xl">🥇</span>
              </th>
              <th
                ref={(el) => {
                  columnRefs.current[2] = el;
                }}
                className="py-6 px-4 text-center w-28"
              >
                <span className="text-5xl">🥈</span>
              </th>
              <th
                ref={(el) => {
                  columnRefs.current[3] = el;
                }}
                className="py-6 px-4 text-center w-28"
              >
                <span className="text-5xl">🥉</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <SectionHeader title="Frontend" />
            {frontendCategories.map((category) => (
              <ScoreRow
                key={category.name}
                category={category}
                isVersion52={isVersion52}
                columnRefs={columnRefs}
              />
            ))}

            <SectionHeader title="Backend" />
            {backendCategories.map((category) => (
              <ScoreRow
                key={category.name}
                category={category}
                isVersion52={isVersion52}
                columnRefs={columnRefs}
              />
            ))}

            <SectionHeader title="Bonus" />
            <ScoreRow
              category={bonusCategory}
              isVersion52={isVersion52}
              columnRefs={columnRefs}
            />
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <p className="mt-6 text-sm text-gray-400">
        Click the title to see rankings change
      </p>
    </div>
  );
}
