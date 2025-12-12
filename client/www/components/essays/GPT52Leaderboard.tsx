'use client';

import { useState, useRef, useEffect } from 'react';

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
    name: 'Boxes + Physics',
    rankings51: { codex: 3, claude: 1, gemini: 2 },
    rankings52: { codex: 2, claude: 1, gemini: 2 },
  },
  {
    name: 'Characters + guns',
    rankings51: { codex: 3, claude: 1, gemini: 2 },
    rankings52: { codex: 2, claude: 1, gemini: 2 },
  },
  {
    name: 'POV gun',
    rankings51: { codex: 2, claude: 1, gemini: 3 },
    rankings52: { codex: 2, claude: 1, gemini: 3 },
  },
  {
    name: 'Sounds',
    rankings51: { codex: 2, claude: 1, gemini: 3 },
    rankings52: { codex: 2, claude: 1, gemini: 3 },
  },
];

const backendCategories: Category[] = [
  {
    name: 'Moving',
    rankings51: { codex: 2, claude: 3, gemini: 1 },
    rankings52: { codex: 1, claude: 3, gemini: 1 },
  },
  {
    name: 'Shooting',
    rankings51: { codex: 3, claude: 1, gemini: 2 },
    rankings52: { codex: 1, claude: 1, gemini: 3 },
  },
  {
    name: 'Saving rooms',
    rankings51: { codex: 2, claude: 3, gemini: 1 },
    rankings52: { codex: 2, claude: 3, gemini: 1 },
  },
];

const bonusCategory: Category = {
  name: 'Bonus',
  rankings51: { codex: 2, claude: 3, gemini: 1 },
  rankings52: { codex: 1, claude: 3, gemini: 1 },
};

type AIName = 'codex' | 'claude' | 'gemini';

const aiLogos: Record<AIName, string> = {
  claude:
    'https://uxwing.com/wp-content/themes/uxwing/download/brands-and-social-media/claude-ai-icon.svg',
  gemini:
    'https://uxwing.com/wp-content/themes/uxwing/download/brands-and-social-media/google-gemini-icon.svg',
  codex: 'https://www.svgrepo.com/show/306500/openai.svg',
};

const aiLabels: Record<AIName, string> = {
  codex: 'Codex',
  claude: 'Claude',
  gemini: 'Gemini',
};

const aiVersions51: Record<AIName, string> = {
  codex: 'Codex 5.1 Max',
  claude: 'Claude Opus 4',
  gemini: 'Gemini 2.5 Pro',
};

const aiVersions52: Record<AIName, string> = {
  codex: 'GPT 5.2',
  claude: 'Claude Opus 4',
  gemini: 'Gemini 2.5 Pro',
};

function AIBadge({ ai, style }: { ai: AIName; style?: React.CSSProperties }) {
  return (
    <div
      className="absolute flex items-center justify-center transition-all duration-700 ease-out"
      style={style}
    >
      <div className="flex h-7 w-7 items-center justify-center rounded-sm border border-gray-200 bg-white p-1 dark:border-neutral-600 dark:bg-neutral-700">
        <img
          src={aiLogos[ai]}
          alt={aiLabels[ai]}
          className="h-full w-full object-contain dark:brightness-200 dark:invert"
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
      (['codex', 'claude', 'gemini'] as AIName[]).forEach((ai) => {
        const pos = rankings[ai];
        aisAtPosition[pos].push(ai);
      });

      (['codex', 'claude', 'gemini'] as AIName[]).forEach((ai) => {
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
          offsetX =
            indexInGroup === 0 ? -horizontalSpacing / 2 : horizontalSpacing / 2;
        } else if (totalInGroup === 3) {
          offsetX = (indexInGroup - 1) * horizontalSpacing;
        }

        newPositions[ai] = {
          left:
            colRect.left -
            rowRect.left +
            colRect.width / 2 -
            badgeSize / 2 +
            offsetX,
          top: baseTop,
        };
      });

      setPositions(newPositions);
    };

    calculatePositions();
    window.addEventListener('resize', calculatePositions);
    return () => window.removeEventListener('resize', calculatePositions);
  }, [rankings, columnRefs]);

  return (
    <div
      ref={rowRef}
      className="relative flex h-12 border-b border-gray-100 dark:border-neutral-700"
    >
      <div className="flex flex-1 items-center px-4 py-2 font-mono text-sm text-gray-700 dark:text-neutral-300">
        {category.name}
      </div>
      <div className="w-16 flex-shrink-0 px-2 py-2"></div>
      <div className="w-16 flex-shrink-0 px-2 py-2"></div>
      <div className="w-16 flex-shrink-0 px-2 py-2"></div>
      {(['codex', 'claude', 'gemini'] as AIName[]).map((ai) => (
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
    <div className="bg-gray-50 px-4 py-1.5 dark:bg-neutral-800">
      <span className="font-mono text-xs font-bold tracking-wider text-gray-900 uppercase dark:text-white">
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

  const aiVersions = isVersion52 ? aiVersions52 : aiVersions51;

  return (
    <div className="flex flex-col items-center py-4">
      {/* Version Switcher */}
      <div className="mb-4 w-full max-w-[500px]">
        <div className="relative flex rounded-lg bg-gray-100 p-1 dark:bg-neutral-700">
          {/* Sliding shadow/highlight */}
          <div
            className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-md bg-white shadow-md transition-all duration-300 ease-out dark:bg-neutral-600"
            style={{
              left: isVersion52 ? 'calc(50% + 2px)' : '4px',
            }}
          />

          {/* Predecessor option */}
          <button
            onClick={() => setIsVersion52(false)}
            className={`relative z-10 flex flex-1 flex-col items-center rounded-md px-4 py-2 transition-colors duration-200 ${
              !isVersion52 ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-neutral-400'
            }`}
          >
            <span className="text-xs font-medium uppercase tracking-wide opacity-60">Predecessor</span>
            <span className="font-mono text-sm font-bold">Codex 5.1 Max</span>
          </button>

          {/* Now option */}
          <button
            onClick={() => setIsVersion52(true)}
            className={`relative z-10 flex flex-1 flex-col items-center rounded-md px-4 py-2 transition-colors duration-200 ${
              isVersion52 ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-neutral-400'
            }`}
          >
            <span className="text-xs font-medium uppercase tracking-wide opacity-60">Now</span>
            <span className="font-mono text-sm font-bold">GPT 5.2</span>
          </button>
        </div>
      </div>

      {/* Scorecard */}
      <div className="w-full max-w-[500px] overflow-hidden rounded-sm border border-gray-200 bg-white dark:border-neutral-700 dark:bg-neutral-800">
        {/* Header row */}
        <div className="flex border-b border-gray-200 dark:border-neutral-700">
          <div className="flex-1 px-4 py-2"></div>
          <div
            ref={(el) => {
              columnRefs.current[1] = el;
            }}
            className="flex w-16 flex-shrink-0 items-center justify-center px-2 py-2"
          >
            <span className="text-4xl">🥇</span>
          </div>
          <div
            ref={(el) => {
              columnRefs.current[2] = el;
            }}
            className="flex w-16 flex-shrink-0 items-center justify-center px-2 py-2"
          >
            <span className="text-4xl">🥈</span>
          </div>
          <div
            ref={(el) => {
              columnRefs.current[3] = el;
            }}
            className="flex w-16 flex-shrink-0 items-center justify-center px-2 py-2"
          >
            <span className="text-4xl">🥉</span>
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

        {/* Legend */}
        <div className="border-t border-gray-200 px-4 py-3 dark:border-neutral-700">
          <div className="flex justify-start gap-6">
            {(['claude', 'gemini', 'codex'] as AIName[]).map((ai) => (
              <div key={ai} className="flex items-center gap-2">
                <div className="flex h-5 w-5 items-center justify-center rounded-sm border border-gray-200 bg-white p-0.5 dark:border-neutral-600 dark:bg-neutral-700">
                  <img
                    src={aiLogos[ai]}
                    alt={aiLabels[ai]}
                    className="h-full w-full object-contain dark:brightness-200 dark:invert"
                  />
                </div>
                <span className="font-mono text-xs text-gray-600 dark:text-neutral-400">
                  {aiVersions[ai]}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
