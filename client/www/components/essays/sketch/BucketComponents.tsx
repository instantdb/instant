'use client';

/**
 * Note: These visualizations are mostly vibe coded.
 * This is single-use code for the count_min_sketch essay.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { hash32, stem } from './sketch';
import { useExactCounts } from './exactCounts';
import { useId } from 'react';

type BiasedHashFn = {
  name: string;
  fn: (word: string, seed: number, columns: number) => number;
};

const BIASED_HASH_FUNCTIONS: Record<string, BiasedHashFn> = {
  'bias-wet': {
    name: 'bias-wet',
    fn: (word: string, seed: number, columns: number) => {
      const normalized = word.toLowerCase();
      // wet and castle go to bucket 1, everything else to bucket 3
      if (normalized === 'wet' || normalized === 'castle') {
        return 1;
      }
      return 3;
    },
  },
  'more-buckets-demo': {
    name: 'more-buckets-demo',
    fn: (word: string, seed: number, columns: number) => {
      const normalized = word.toLowerCase();
      if (columns === 4) {
        // For 4 buckets: wet and castle collide in bucket 1
        if (normalized === 'wet' || normalized === 'castle') {
          return 1;
        }
        if (normalized === 'peer') {
          return 3;
        }
      } else if (columns === 5) {
        // For 5 buckets: spread them out nicely
        if (normalized === 'castle') {
          return 0;
        }
        if (normalized === 'peer') {
          return 2;
        }
        if (normalized === 'wet') {
          return 4;
        }
      }
      return 0;
    },
  },
  'rows-of-hashes': {
    name: 'rows-of-hashes',
    fn: (word: string, seed: number, columns: number) => {
      const normalized = word.toLowerCase();
      // seed 0 = hash1 (row 0), seed 1 = hash2 (row 1)
      if (seed === 0) {
        // hash1: same as initial demo - castle + wet collide in bucket 1, peer + like collide in bucket 3
        if (normalized === 'castle' || normalized === 'wet') {
          return 1;
        }
        if (normalized === 'peer' || normalized === 'like') {
          return 3;
        }
      } else if (seed === 1) {
        // hash2: spreads them out - peer gets its own bucket
        if (normalized === 'castle') {
          return 3;
        }
        if (normalized === 'peer') {
          return 1;
        }
        if (normalized === 'wet') {
          return 0;
        }
        if (normalized === 'like') {
          return 3;
        }
      }
      return 0;
    },
  },
};

const numberFormatter = new Intl.NumberFormat('en-US');

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

type ColorScheme = {
  text: string;
  chip: string;
  soft: string;
  border: string;
  dot: string;
  ring: string;
};

const COLOR_SCHEMES: ColorScheme[] = [
  {
    text: 'text-sky-700',
    chip: 'bg-sky-100 text-sky-800',
    soft: 'bg-sky-50',
    border: 'border-sky-300',
    dot: 'bg-sky-500',
    ring: 'ring-sky-300',
  },
  {
    text: 'text-amber-700',
    chip: 'bg-amber-100 text-amber-800',
    soft: 'bg-amber-50',
    border: 'border-amber-300',
    dot: 'bg-amber-500',
    ring: 'ring-amber-300',
  },
  {
    text: 'text-fuchsia-700',
    chip: 'bg-fuchsia-100 text-fuchsia-800',
    soft: 'bg-fuchsia-50',
    border: 'border-fuchsia-300',
    dot: 'bg-fuchsia-500',
    ring: 'ring-fuchsia-300',
  },
  {
    text: 'text-rose-700',
    chip: 'bg-rose-100 text-rose-800',
    soft: 'bg-rose-50',
    border: 'border-rose-300',
    dot: 'bg-rose-500',
    ring: 'ring-rose-300',
  },
  {
    text: 'text-emerald-700',
    chip: 'bg-emerald-100 text-emerald-800',
    soft: 'bg-emerald-50',
    border: 'border-emerald-300',
    dot: 'bg-emerald-500',
    ring: 'ring-emerald-300',
  },
  {
    text: 'text-indigo-700',
    chip: 'bg-indigo-100 text-indigo-800',
    soft: 'bg-indigo-50',
    border: 'border-indigo-300',
    dot: 'bg-indigo-500',
    ring: 'ring-indigo-300',
  },
];

const DEMO_BUCKET_MAX_FILL = 800;

const DEFAULT_BUCKET_WORDS = ['castle', 'droop', 'like', 'wet'];

function createZeroMatrix(rows: number, columns: number): number[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: columns }, () => 0),
  );
}

type BucketVisualizerProps = {
  variant?: 'insert' | 'query';
  rows?: number;
  columns?: number;
  words?: string[];
  autoPlay?: boolean;
  stepDurationMs?: number;
  highlightWord?: string;
  title?: string;
  note?: string | null;
  showLegend?: boolean;
  className?: string;
  maxFill?: number;
  hashFunction?: string;
};

type WordEntry = {
  index: number;
  label: string;
  normalized: string;
  count: number;
  scheme: ColorScheme;
};

type ActiveCell = {
  row: number;
  column: number;
  word: WordEntry;
  amount: number;
};

type AnimatingWord = {
  word: WordEntry;
  targetRow: number;
  targetColumn: number;
  id: string;
};

type WordFill = {
  word: WordEntry;
  color: string;
  fillRatio: number;
};

function getWordFillColor(word: WordEntry) {
  const soft = word.scheme.soft;
  if (soft.includes('sky')) return '#7dd3fc';
  if (soft.includes('amber')) return '#fcd34d';
  if (soft.includes('fuchsia')) return '#f0abfc';
  if (soft.includes('rose')) return '#fda4af';
  if (soft.includes('emerald')) return '#6ee7b7';
  if (soft.includes('indigo')) return '#a5b4fc';
  return '#e5e7eb';
}

function calculateWordFills(words: WordEntry[], maxFill: number): WordFill[] {
  if (!words.length) return [];

  const total = words.reduce((sum, word) => sum + word.count, 0);
  const shouldScaleToTotal = total > maxFill && total > 0;
  const denominator = shouldScaleToTotal ? total : Math.max(maxFill, 1);

  return words.map((word) => ({
    word,
    color: getWordFillColor(word),
    fillRatio: Math.min(word.count / denominator, 1),
  }));
}

function formatNumber(value: number) {
  return numberFormatter.format(value);
}

export function BucketVisualizer({
  variant = 'insert',
  rows: rowsProp = 1,
  columns: columnsProp = 4,
  words,
  highlightWord,
  title,
  note,
  className,
  maxFill = 1000,
  hashFunction,
}: BucketVisualizerProps) {
  const rows = Math.max(1, rowsProp);
  const columns = Math.max(2, columnsProp);
  const componentId = useId();

  const { counts } = useExactCounts();
  const defaultHashFn = hash32;

  // Use biased hash function if specified, otherwise use default
  const hashFn = useMemo(() => {
    if (!hashFunction) return defaultHashFn;
    const biasedFn = BIASED_HASH_FUNCTIONS[hashFunction];
    if (!biasedFn) return defaultHashFn;

    // Wrap the biased function to match the HashFn signature
    return (word: string, seed: number) => biasedFn.fn(word, seed, columns);
  }, [hashFunction, defaultHashFn, columns]);

  const normalizedWords = useMemo(() => {
    const base = words && words.length > 0 ? words : DEFAULT_BUCKET_WORDS;
    return base.map((word) => word.trim()).filter((word) => word.length > 0);
  }, [words]);

  const wordEntries = useMemo<WordEntry[]>(() => {
    return normalizedWords.map((label, index) => {
      const normalized = stem(label);
      const scheme = COLOR_SCHEMES[index % COLOR_SCHEMES.length]!;
      const count = counts[normalized] ?? 0;
      return { index, label, normalized, scheme, count };
    });
  }, [counts, normalizedWords]);

  const contributions = useMemo(() => {
    if (!wordEntries.length) return null;
    const matrix: WordEntry[][][] = Array.from({ length: rows }, () =>
      Array.from({ length: columns }, () => [] as WordEntry[]),
    );
    for (const entry of wordEntries) {
      for (let rowIdx = 0; rowIdx < rows; rowIdx++) {
        const columnIdx = hashFn(entry.normalized, rowIdx) % columns;
        matrix[rowIdx]![columnIdx]!.push(entry);
      }
    }
    return matrix;
  }, [hashFn, wordEntries, rows, columns]);

  const finalBuckets = useMemo(() => {
    if (!contributions) return null;
    return contributions.map((row) =>
      row.map((bucket) => bucket.reduce((sum, entry) => sum + entry.count, 0)),
    );
  }, [contributions]);

  const ready = Boolean(contributions && finalBuckets);

  const [buckets, setBuckets] = useState<number[][]>(() =>
    createZeroMatrix(rows, columns),
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [processedWords, setProcessedWords] = useState<Set<number>>(new Set());
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null);
  const [animatingWords, setAnimatingWords] = useState<AnimatingWord[]>([]);
  const activeTimeoutRef = useRef<number | null>(null);
  const wasAutoPlayedRef = useRef(false);

  const wordsFingerprint = useMemo(() => {
    return wordEntries
      .map((entry) => `${entry.normalized}:${entry.count}`)
      .join('|');
  }, [wordEntries]);

  useEffect(() => {
    if (variant !== 'insert') return;
    setBuckets(createZeroMatrix(rows, columns));
    setStepIndex(0);
    setProcessedWords(new Set());
    setIsPlaying(false);
    setActiveCell(null);
    setAnimatingWords([]);
    wasAutoPlayedRef.current = false;
  }, [variant, rows, columns, wordsFingerprint]);

  useEffect(() => {
    return () => {
      if (activeTimeoutRef.current !== null) {
        window.clearTimeout(activeTimeoutRef.current);
        activeTimeoutRef.current = null;
      }
    };
  }, []);

  const totalSteps = wordEntries.length * rows;

  // Removed auto-play effect - only manual stepping allowed

  const handleAddWord = useCallback(
    (wordIndex: number) => {
      if (!ready) return;
      if (!hashFn || !contributions || !wordEntries.length) return;
      const word = wordEntries[wordIndex];
      if (!word) return;

      // Mark this word as processed
      setProcessedWords((prev) => new Set(prev).add(wordIndex));

      // Create animating words for each row
      const newAnimatingWords: AnimatingWord[] = [];
      for (let rowIdx = 0; rowIdx < rows; rowIdx++) {
        const columnIdx = hashFn(word.normalized, rowIdx) % columns;
        newAnimatingWords.push({
          word,
          targetRow: rowIdx,
          targetColumn: columnIdx,
          id: `${word.normalized}-${rowIdx}-${Date.now()}`,
        });
      }
      setAnimatingWords(newAnimatingWords);

      // After animation completes, update buckets and clear animating words
      setTimeout(() => {
        setBuckets((prev) => {
          const next = prev.map((row) => row.slice());
          for (let rowIdx = 0; rowIdx < rows; rowIdx++) {
            const columnIdx = hashFn(word.normalized, rowIdx) % columns;
            next[rowIdx]![columnIdx]! += word.count;
          }
          return next;
        });
        setAnimatingWords([]);
      }, 900); // Animation duration
    },
    [ready, hashFn, contributions, wordEntries, rows, columns],
  );

  const handleStep = useCallback(() => {
    if (!ready) return;
    // Find the first word that hasn't been processed yet
    const nextWordIndex = wordEntries.findIndex(
      (word) => !processedWords.has(word.index),
    );
    if (nextWordIndex === -1) return; // All words processed
    handleAddWord(nextWordIndex);
  }, [ready, wordEntries, processedWords, handleAddWord]);

  const handleReset = useCallback(() => {
    if (activeTimeoutRef.current !== null) {
      window.clearTimeout(activeTimeoutRef.current);
      activeTimeoutRef.current = null;
    }
    setIsPlaying(false);
    setActiveCell(null);
    setAnimatingWords([]);
    setBuckets(createZeroMatrix(rows, columns));
    setStepIndex(0);
    setProcessedWords(new Set());
    wasAutoPlayedRef.current = false;
  }, [columns, rows]);

  const isComplete = variant === 'insert' && stepIndex >= totalSteps;

  // For query variant, compute the selected word directly
  const selectedWord = useMemo(() => {
    if (!wordEntries.length) return null;

    // If highlightWord is provided, use it
    if (highlightWord) {
      const normalized = stem(highlightWord);
      const found = wordEntries.find(
        (entry) => entry.normalized === normalized,
      );
      if (found) return found;
    }

    // Otherwise default to first word
    return wordEntries[0] ?? null;
  }, [highlightWord, wordEntries]);

  const [selectedWordId, setSelectedWordId] = useState<string | null>(
    selectedWord?.normalized ?? null,
  );

  // Update selectedWordId when selectedWord changes (for initial load and highlightWord changes)
  useEffect(() => {
    if (selectedWord && variant === 'query') {
      setSelectedWordId(selectedWord.normalized);
    }
  }, [selectedWord, variant]);

  // Get the actual selected word based on ID (allows user interaction to override)
  const activeSelectedWord = useMemo(() => {
    if (!wordEntries.length) return null;

    // If user has selected something, use that
    if (selectedWordId && variant === 'query') {
      const found = wordEntries.find(
        (entry) => entry.normalized === selectedWordId,
      );
      if (found) return found;
    }

    // Otherwise use the computed selectedWord
    return selectedWord;
  }, [selectedWordId, selectedWord, wordEntries, variant]);

  const queryHighlights = useMemo(() => {
    if (
      variant !== 'query' ||
      !activeSelectedWord ||
      !hashFn ||
      !finalBuckets ||
      !contributions
    ) {
      return [];
    }
    const highlights = Array.from({ length: rows }, (_, rowIdx) => {
      const columnIdx = hashFn(activeSelectedWord.normalized, rowIdx) % columns;
      const value = finalBuckets[rowIdx]?.[columnIdx] ?? 0;
      const wordsInBucket =
        contributions[rowIdx]?.[columnIdx]?.map((entry) => entry) ?? [];
      return {
        rowIdx,
        columnIdx,
        value,
        words: wordsInBucket,
      };
    });

    // Find the minimum value across all rows
    const minValue = highlights.reduce(
      (acc, { value }) => Math.min(acc, value),
      Number.POSITIVE_INFINITY,
    );

    // Add isMinimum flag to each highlight
    return highlights.map((h) => ({
      ...h,
      isMinimum: h.value === minValue,
    }));
  }, [
    columns,
    contributions,
    finalBuckets,
    hashFn,
    rows,
    activeSelectedWord,
    variant,
  ]);

  const estimateValue =
    queryHighlights.length > 0
      ? queryHighlights.reduce(
          (acc, { value }) => Math.min(acc, value),
          Number.POSITIVE_INFINITY,
        )
      : null;

  const displayBuckets =
    variant === 'insert'
      ? buckets
      : (finalBuckets ?? createZeroMatrix(rows, columns));

  const footnote = note ?? undefined;

  const remainingWords = useMemo(() => {
    return wordEntries.filter((word) => !processedWords.has(word.index));
  }, [wordEntries, processedWords]);
  const allWordsProcessed = remainingWords.length === 0;

  if (!ready) {
    return (
      <div className="my-6 flex flex-col items-center">
        <div className="w-full max-w-3xl space-y-4">
          <div className="rounded-3xl border-2 border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
            Loading sketch data&hellip;
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('my-6 flex flex-col items-center font-mono', className)}>
      <div className="w-full max-w-3xl space-y-4">
        {title ? (
          <h3 className="text-center text-xl font-semibold">{title}</h3>
        ) : null}
        {variant === 'insert' ? (
          <div className="flex items-center justify-end gap-3">
            <button
              className="border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 hover:bg-gray-50"
              onClick={handleReset}
            >
              Reset
            </button>
            <button
              className={cn(
                'border px-3 py-1.5 text-sm font-semibold',
                allWordsProcessed
                  ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                  : 'border-gray-300 bg-white text-gray-900 hover:bg-gray-50',
              )}
              onClick={handleStep}
              disabled={allWordsProcessed}
            >
              Step
            </button>
          </div>
        ) : null}
        <div className="border border-gray-200 bg-white p-6">
          {variant === 'insert' ? (
            <div className="flex min-h-[60px] items-center gap-3">
              {/* Word list */}
              <div className="flex flex-1 flex-wrap gap-3">
                {remainingWords.length > 0 ? (
                  remainingWords.map((word) => (
                    <button
                      key={word.normalized}
                      onClick={() => handleAddWord(word.index)}
                      className="flex cursor-pointer flex-col items-center transition-colors"
                    >
                      <span
                        className={cn(
                          'border px-3 py-1.5 text-xs font-medium transition-colors hover:brightness-95',
                          word.scheme.chip,
                          word.scheme.border,
                        )}
                      >
                        {word.label}
                      </span>
                      <span className="mt-1 text-xs font-medium text-gray-700">
                        +{formatNumber(word.count)}
                      </span>
                    </button>
                  ))
                ) : (
                  <span className="text-sm font-medium text-green-700">
                    All words have been inserted.
                  </span>
                )}
              </div>
            </div>
          ) : null}
          {variant === 'query' && activeSelectedWord ? (
            <QueryControls
              words={wordEntries}
              selectedWord={activeSelectedWord}
              onSelect={setSelectedWordId}
              estimateValue={
                estimateValue === null || estimateValue === Infinity
                  ? 0
                  : estimateValue
              }
              componentId={componentId}
            />
          ) : null}
          <div className="mt-6 space-y-6">
            {displayBuckets.map((rowValues, rowIdx) => {
              const rowLabel = `hash${rowIdx + 1}`;
              const highlight =
                variant === 'query'
                  ? queryHighlights.find((item) => item.rowIdx === rowIdx)
                  : null;
              const highlightColumn = highlight?.columnIdx ?? null;
              const highlightedWords = highlight?.words ?? [];
              const isMinimumRow = highlight?.isMinimum ?? false;
              const activeColumn =
                activeCell && activeCell.row === rowIdx
                  ? activeCell.column
                  : null;
              const rowAnimatingWords = animatingWords.filter(
                (aw) => aw.targetRow === rowIdx,
              );
              return (
                <BucketRow
                  key={rowIdx}
                  rowIdx={rowIdx}
                  label={rowLabel}
                  bucketValues={rowValues}
                  highlightColumn={highlightColumn}
                  contributions={contributions?.[rowIdx] ?? []}
                  variant={variant}
                  columns={columns}
                  activeColumn={activeColumn}
                  activeCell={activeCell}
                  highlightedWords={highlightedWords}
                  processedWords={processedWords}
                  maxFill={maxFill}
                  animatingWords={rowAnimatingWords}
                  selectedWord={activeSelectedWord}
                  isMinimumRow={isMinimumRow}
                  componentId={componentId}
                />
              );
            })}
          </div>
        </div>
      </div>
      {footnote ? (
        <p className="mt-4 text-sm italic text-orange-800">{footnote}</p>
      ) : null}
    </div>
  );
}

function QueryControls({
  words,
  selectedWord,
  onSelect,
  estimateValue,
  componentId,
}: {
  words: WordEntry[];
  selectedWord: WordEntry;
  onSelect: (word: string) => void;
  estimateValue: number;
  componentId: string;
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-wrap gap-3">
        {words.map((word) => {
          const isActive = word.normalized === selectedWord.normalized;
          return (
            <button
              key={word.normalized}
              onClick={() => onSelect(word.normalized)}
              className="relative flex cursor-pointer flex-col items-center transition-colors"
            >
              {isActive && (
                <motion.div
                  layoutId={`query-indicator-${componentId}`}
                  className={cn(
                    'absolute -top-2.5 left-0 right-0 h-1',
                    selectedWord.scheme.dot,
                  )}
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                />
              )}
              <span
                className={cn(
                  'border px-3 py-1.5 text-xs font-medium transition-colors',
                  word.scheme.chip,
                  word.scheme.border,
                  isActive
                    ? 'border-2'
                    : 'hover:brightness-95',
                )}
              >
                {word.label}
              </span>
            </button>
          );
        })}
      </div>
      <div className="text-sm text-gray-600">
        Estimate:{' '}
        <span className={cn('font-semibold', selectedWord.scheme.text)}>
          {formatNumber(estimateValue)} times
        </span>
      </div>
    </div>
  );
}

function BucketRow({
  rowIdx,
  label,
  bucketValues,
  highlightColumn,
  contributions,
  variant,
  columns,
  activeColumn,
  activeCell,
  processedWords,
  maxFill,
  animatingWords,
  selectedWord,
  isMinimumRow,
  componentId,
}: {
  rowIdx: number;
  label: string;
  bucketValues: number[];
  highlightColumn: number | null;
  contributions: WordEntry[][];
  variant: 'insert' | 'query';
  columns: number;
  activeColumn: number | null;
  activeCell: ActiveCell | null;
  highlightedWords: WordEntry[];
  processedWords: Set<number>;
  maxFill: number;
  animatingWords: AnimatingWord[];
  selectedWord: WordEntry | null;
  isMinimumRow?: boolean;
  componentId: string;
}) {
  const gridRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="font-mono text-sm font-semibold uppercase tracking-wide text-gray-600">
          {label}()
        </span>
      </div>

      {/* Animating words */}
      <AnimatePresence>
        {animatingWords.map((animWord) => {
          // Calculate target position based on grid width
          const getTargetX = () => {
            if (!gridRef.current) return 0;
            const gridWidth = gridRef.current.offsetWidth;
            const gap = 12; // gap-3 = 12px
            const totalGaps = (columns - 1) * gap;
            const bucketWidth = (gridWidth - totalGaps) / columns;
            return (
              animWord.targetColumn * (bucketWidth + gap) + bucketWidth / 2
            );
          };

          return (
            <motion.div
              key={animWord.id}
              initial={{ x: 0, y: -40, opacity: 0, scale: 0.8 }}
              animate={{
                x: [0, 0, getTargetX()],
                y: [-40, 8, 100],
                opacity: [0, 1, 1, 0],
                scale: [0.8, 1, 1, 0.6],
              }}
              exit={{ opacity: 0 }}
              transition={{
                duration: 0.9,
                ease: 'easeInOut',
                times: [0, 0.35, 1],
              }}
              className="pointer-events-none absolute left-0 top-0 z-10"
              style={{
                transformOrigin: 'center center',
              }}
            >
              <span
                className={cn(
                  'inline-block whitespace-nowrap px-2 py-0.5 text-xs font-medium',
                  animWord.word.scheme.chip,
                )}
              >
                +{formatNumber(animWord.word.count)} ({animWord.word.label})
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>
      <div
        ref={gridRef}
        className="grid gap-3"
        style={{
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        }}
      >
        {bucketValues.map((value, columnIdx) => {
          const wordsInBucket = contributions[columnIdx] ?? [];
          const visibleWords =
            variant === 'insert'
              ? wordsInBucket.filter(
                  (word) =>
                    processedWords.has(word.index) ||
                    (activeCell &&
                      activeCell.word.index === word.index &&
                      activeCell.row === rowIdx &&
                      activeCell.column === columnIdx),
                )
              : wordsInBucket;
          const isHighlight =
            variant === 'query' && highlightColumn === columnIdx;
          const isActive = variant === 'insert' && activeColumn === columnIdx;

          // Calculate fill levels for each word
          const wordFills = calculateWordFills(visibleWords, maxFill);

          return (
            <div
              key={columnIdx}
              className="relative flex flex-col items-center"
            >
              {/* Colored indicator line for query highlight */}
              {variant === 'query' && isHighlight && selectedWord && (
                <motion.div
                  layoutId={`bucket-indicator-${componentId}-${rowIdx}`}
                  className={cn(
                    'absolute -top-2 left-0 right-0 h-1',
                    isMinimumRow ? selectedWord.scheme.dot : 'bg-gray-900',
                  )}
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                />
              )}

              {/* Bucket */}
              <div className="relative h-24 w-full">
                <BucketSVG
                  fillColor="white"
                  strokeColor="black"
                  isHighlight={false}
                  isActive={isActive}
                  wordFills={wordFills}
                  bucketId={`${rowIdx}-${columnIdx}`}
                />
              </div>

              {/* Count below bucket */}
              <div
                className={cn(
                  'mt-2 text-center text-lg font-semibold',
                  variant === 'query' &&
                    isHighlight &&
                    selectedWord &&
                    isMinimumRow
                    ? selectedWord.scheme.text
                    : 'text-gray-900',
                )}
              >
                {formatNumber(value)}
              </div>

              {/* Word pills below count */}
              <div className="mt-2 flex min-h-[24px] flex-wrap justify-center gap-1">
                {visibleWords.length > 0
                  ? visibleWords.map((word) => (
                      <span
                        key={word.normalized}
                        className="inline-flex items-center gap-1 text-xs font-medium"
                      >
                        <span className={cn('px-2 py-0.5', word.scheme.chip)}>
                          {word.label}
                        </span>
                        <span className="text-gray-700">
                          +{formatNumber(word.count)}
                        </span>
                      </span>
                    ))
                  : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BucketSVG({
  fillColor = 'white',
  strokeColor = 'black',
  isHighlight = false,
  isActive = false,
  wordFills = [],
  bucketId,
}: {
  fillColor?: string;
  strokeColor?: string;
  isHighlight?: boolean;
  isActive?: boolean;
  wordFills?: WordFill[];
  bucketId?: string;
}) {
  const displayFillColor = isHighlight || isActive ? '#f0f9ff' : fillColor;
  const displayStrokeColor = isHighlight || isActive ? '#0ea5e9' : strokeColor;

  // The bucket goes from y=15 (top) to y=95 (bottom of curve)
  const topY = 15;
  const bottomY = 95;
  const bucketHeight = bottomY - topY; // 80

  // Account for stroke width to ensure fills are visible
  const strokeWidth = 3;
  const padding = strokeWidth / 2;
  const rectX = 15 + padding;
  const rectWidth = 70 - strokeWidth;

  const backupId = useId();
  const clipId = `bucket-clip-${bucketId || backupId}`;

  // Create stacked rectangles from bottom to top
  let cumulativeHeight = 0;
  const fillRects = wordFills.map((wordFill) => {
    const fillHeight = bucketHeight * wordFill.fillRatio;
    const rectY = bottomY - cumulativeHeight - fillHeight;
    const rectHeight = fillHeight;

    cumulativeHeight += fillHeight;

    return {
      y: rectY,
      height: rectHeight,
      color: wordFill.color,
    };
  });

  return (
    <svg
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      className="h-full w-full"
    >
      <defs>
        {/* Clip path defines the bucket shape */}
        <clipPath id={clipId}>
          <path d="M 15 15 L 20 85 Q 50 95, 80 85 L 85 15 Q 50 20, 15 15" />
        </clipPath>
      </defs>

      {/* Background fill (white or highlighted) */}
      <path
        d="M 15 15 L 20 85 Q 50 95, 80 85 L 85 15 Q 50 20, 15 15"
        fill={displayFillColor}
        stroke="none"
      />

      {/* Stacked color rectangles clipped to bucket shape */}
      <g clipPath={`url(#${clipId})`}>
        {fillRects.map((rect, index) => (
          <motion.rect
            key={index}
            x={rectX}
            initial={{ y: bottomY, height: 0 }}
            animate={{ y: rect.y, height: rect.height }}
            transition={{ duration: 0.6, ease: 'easeOut', delay: index * 0.1 }}
            width={rectWidth}
            fill={rect.color}
            opacity="0.8"
          />
        ))}
      </g>

      {/* Bucket outline on top */}
      <path
        d="M 15 15 L 20 85 Q 50 95, 80 85 L 85 15 Q 50 20, 15 15"
        fill="none"
        stroke={displayStrokeColor}
        strokeWidth="3"
      />

      {/* Top ellipse */}
      <ellipse
        cx="50"
        cy="15"
        rx="35"
        ry="8"
        fill={displayFillColor}
        stroke={displayStrokeColor}
        strokeWidth="3"
      />
    </svg>
  );
}

function ResultCardSide({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="text-3xl font-bold text-gray-900 transition-all">
        {value !== null ? value.toLocaleString('en-US') : '—'}
      </div>
      <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </div>
    </div>
  );
}

function ExampleButton({
  word,
  isActive,
  onSelect,
}: {
  word: string;
  isActive: boolean;
  onSelect: (word: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(word)}
      className={cn(
        'border px-3 py-1.5 text-sm font-semibold',
        isActive
          ? 'border-gray-900 bg-gray-900 text-white hover:bg-gray-800'
          : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50',
      )}
    >
      {word}
    </button>
  );
}

export function SingleRowBucketsDemo() {
  // Preset color fills for 10 buckets (percentages of fill)
  // Bucket at index 5 shows 'wet' with noise breakdown, matching BucketNoiseBreakdownDemo
  const bucketFills = [
    { fills: [{ color: '#fda4af', fillRatio: 0.2 }] }, // rose - 20%
    { fills: [{ color: '#a5b4fc', fillRatio: 0.15 }] }, // indigo - 15%
    { fills: [{ color: '#f0abfc', fillRatio: 0.1 }] }, // fuchsia - 10%
    { fills: [{ color: '#e5e7eb', fillRatio: 0.05 }] }, // gray - 5%
    { fills: [{ color: '#e5e7eb', fillRatio: 0 }] }, // empty
    {
      // wet bucket with noise - matching the breakdown demo visual
      fills: [
        { color: '#6ee7b7', fillRatio: 0.28 }, // emerald for 'wet' (168/600)
        { color: '#fda4af', fillRatio: 0.42 }, // rose for 'noise' (252/600)
      ],
    },
    { fills: [{ color: '#6ee7b7', fillRatio: 0.35 }] }, // emerald - 35%
    { fills: [{ color: '#a5b4fc', fillRatio: 0.45 }] }, // indigo - 45%
    { fills: [{ color: '#7dd3fc', fillRatio: 0.14 }] }, // sky - 14%
    { fills: [{ color: '#fcd34d', fillRatio: 0.06 }] }, // amber - 6% (droop bucket)
  ];

  return (
    <div className="my-6 flex flex-col items-center font-mono">
      <div className="w-full max-w-3xl space-y-4">
        <div className="border border-gray-200 bg-white p-6">
          <div className="space-y-3">
            <div className="relative">
              <div className="mb-0.5 flex items-baseline justify-between">
                <span className="font-mono text-sm font-semibold uppercase tracking-wide text-gray-600">
                  hash1()
                </span>
              </div>
              <div
                className="grid gap-2"
                style={{
                  gridTemplateColumns: 'repeat(10, minmax(0, 1fr))',
                }}
              >
                {bucketFills.map((bucket, idx) => {
                  return (
                    <div
                      key={idx}
                      className="relative flex flex-col items-center"
                    >
                      <div className="relative h-24 w-full">
                        <BucketSVG
                          fillColor="white"
                          strokeColor="black"
                          isHighlight={false}
                          isActive={false}
                          wordFills={bucket.fills.map((fill) => ({
                            word: {
                              label: '',
                              normalized: '',
                              index: 0,
                              count: 0,
                              scheme: COLOR_SCHEMES[0]!,
                            },
                            color: fill.color,
                            fillRatio: fill.fillRatio,
                          }))}
                          bucketId={`single-row-${idx}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function BucketNoiseBreakdownDemo() {
  const { counts } = useExactCounts();

  const wetNormalized = stem('wet');
  const actual = counts[wetNormalized] ?? 0;
  const noise = Math.round(actual * 1.5);
  const total = actual + noise;

  return (
    <div className="my-8 flex flex-col items-center font-mono">
      <div className="w-full max-w-3xl space-y-4">
        <div className="border border-gray-200 bg-white p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex flex-col items-center">
                <motion.div className="absolute -top-2.5 left-0 right-0 h-1 bg-amber-500" />
                <span className="border border-amber-300 bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-800">
                  wet
                </span>
              </div>
            </div>
          </div>
          <div className="mt-6">
            <div className="flex flex-col items-center gap-6 md:flex-row md:justify-center">
              {/* Visual representation of counts */}
              <div className="flex items-end gap-4">
                <div className="flex flex-col items-center">
                  <div className="mb-2 text-xs font-medium text-emerald-700">
                    wet
                  </div>
                  <div
                    className="w-16 bg-emerald-300"
                    style={{
                      height: `${Math.max(8, ((actual ?? 0) / 600) * 120)}px`,
                    }}
                  />
                  <div className="mt-2 text-sm font-semibold text-gray-900">
                    {actual !== null ? formatNumber(actual) : '—'}
                  </div>
                </div>
                <div className="flex flex-col items-center">
                  <div className="mb-2 text-xs font-medium text-rose-700">
                    noise
                  </div>
                  <div
                    className="w-16 bg-rose-300"
                    style={{
                      height: `${Math.max(8, ((noise ?? 0) / 600) * 120)}px`,
                    }}
                  />
                  <div className="mt-2 text-sm font-semibold text-gray-900">
                    {noise !== null ? formatNumber(noise) : '—'}
                  </div>
                </div>
              </div>
              {/* Arrow */}
              <div className="text-2xl text-gray-400">→</div>
              {/* Single bucket */}
              <div className="flex flex-col items-center">
                <div className="relative h-32 w-24">
                  <BucketSVG
                    fillColor="white"
                    strokeColor="black"
                    isHighlight={false}
                    isActive={false}
                    wordFills={[
                      {
                        word: {
                          label: 'wet',
                          normalized: 'wet',
                          index: 0,
                          count: actual ?? 0,
                          scheme: COLOR_SCHEMES[1]!,
                        },
                        color: '#6ee7b7',
                        fillRatio: (actual ?? 0) / 600,
                      },
                      {
                        word: {
                          label: 'noise',
                          normalized: 'noise',
                          index: 1,
                          count: noise ?? 0,
                          scheme: COLOR_SCHEMES[3]!,
                        },
                        color: '#fda4af',
                        fillRatio: (noise ?? 0) / 600,
                      },
                    ]}
                    bucketId="bucket-noise-bucket"
                  />
                </div>
                <div className="mt-2 text-center text-lg font-semibold text-gray-900">
                  {formatNumber(total)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MoreBucketsDemo() {
  const [expanded, setExpanded] = useState(false);
  const sharedWords = ['castle', 'peer', 'wet'];
  const { counts } = useExactCounts();
  const defaultHashFn = hash32;

  const columns = expanded ? 5 : 4;
  const rows = 1;

  // Use custom biased hash function for this demo
  const hashFn = useMemo(() => {
    const biasedFn = BIASED_HASH_FUNCTIONS['more-buckets-demo'];
    if (!biasedFn) return defaultHashFn;
    return (word: string, seed: number) => biasedFn.fn(word, seed, columns);
  }, [defaultHashFn, columns]);

  const normalizedWords = useMemo(
    () =>
      sharedWords.map((word) => word.trim()).filter((word) => word.length > 0),
    [],
  );

  const wordEntries = useMemo<WordEntry[]>(() => {
    return normalizedWords.map((label, index) => {
      const normalized = stem(label);
      const scheme = COLOR_SCHEMES[index % COLOR_SCHEMES.length]!;
      const count = counts[normalized] ?? 0;
      return { index, label, normalized, scheme, count };
    });
  }, [counts, normalizedWords]);

  const contributions = useMemo(() => {
    if (!wordEntries.length) return null;
    const matrix: WordEntry[][][] = Array.from({ length: rows }, () =>
      Array.from({ length: columns }, () => [] as WordEntry[]),
    );
    for (const entry of wordEntries) {
      for (let rowIdx = 0; rowIdx < rows; rowIdx++) {
        const columnIdx = hashFn(entry.normalized, rowIdx) % columns;
        matrix[rowIdx]![columnIdx]!.push(entry);
      }
    }
    return matrix;
  }, [hashFn, wordEntries, rows, columns]);

  const finalBuckets = useMemo(() => {
    if (!contributions) return null;
    return contributions.map((row) =>
      row.map((bucket) => bucket.reduce((sum, entry) => sum + entry.count, 0)),
    );
  }, [contributions]);

  const selectedWord =
    wordEntries.find((entry) => entry.normalized === stem('wet')) ??
    wordEntries[0] ??
    null;

  const queryHighlights = useMemo(() => {
    if (!selectedWord || !hashFn || !finalBuckets || !contributions) {
      return [];
    }
    return Array.from({ length: rows }, (_, rowIdx) => {
      const columnIdx = hashFn(selectedWord.normalized, rowIdx) % columns;
      const value = finalBuckets[rowIdx]?.[columnIdx] ?? 0;
      const wordsInBucket =
        contributions[rowIdx]?.[columnIdx]?.map((entry) => entry) ?? [];
      return { rowIdx, columnIdx, value, words: wordsInBucket };
    });
  }, [columns, contributions, finalBuckets, hashFn, rows, selectedWord]);

  const estimateValue =
    queryHighlights.length > 0
      ? queryHighlights.reduce(
          (acc, { value }) => Math.min(acc, value),
          Number.POSITIVE_INFINITY,
        )
      : null;

  const displayBuckets = finalBuckets ?? createZeroMatrix(rows, columns);

  const ready = Boolean(contributions && finalBuckets);

  if (!ready) {
    return (
      <div className="my-6 flex flex-col items-center">
        <div className="w-full max-w-3xl space-y-4">
          <div className="rounded-3xl border-2 border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
            Loading sketch data&hellip;
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="my-8 space-y-6">
      <div className={cn('my-6 flex flex-col items-center font-mono')}>
        <div className="w-full max-w-3xl space-y-4">
          <div className="flex items-center justify-end gap-4">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex-shrink-0 border border-blue-500 bg-blue-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-600"
            >
              {expanded ? 'Remove 1 bucket' : 'Add 1 bucket'}
            </button>
          </div>
          <div className="border border-gray-200 bg-white p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap gap-3">
                {selectedWord && (
                  <div className="relative flex flex-col items-center">
                    <motion.div
                      layoutId="more-buckets-indicator"
                      className={cn(
                        'absolute -top-2.5 left-0 right-0 h-1',
                        selectedWord.scheme.dot,
                      )}
                      transition={{
                        type: 'spring',
                        bounce: 0.2,
                        duration: 0.6,
                      }}
                    />
                    <span
                      className={cn(
                        'border-2 px-3 py-1.5 text-xs font-medium',
                        selectedWord.scheme.chip,
                        selectedWord.scheme.border,
                      )}
                    >
                      {selectedWord.label}
                    </span>
                  </div>
                )}
              </div>
              <div className="text-sm text-gray-600">
                Estimate:{' '}
                <span
                  className={cn('font-semibold', selectedWord?.scheme.text)}
                >
                  {formatNumber(
                    estimateValue === null || estimateValue === Infinity
                      ? 0
                      : estimateValue,
                  )}{' '}
                  times
                </span>
              </div>
            </div>
            <div className="mt-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key={columns}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-6"
                >
                  {displayBuckets.map((rowValues, rowIdx) => {
                    const rowLabel = `hash${rowIdx + 1}`;
                    const highlightColumn =
                      queryHighlights.find((item) => item.rowIdx === rowIdx)
                        ?.columnIdx ?? null;
                    return (
                      <div key={rowIdx} className="relative">
                        <div className="mb-2 flex items-baseline justify-between">
                          <span className="font-mono text-sm font-semibold uppercase tracking-wide text-gray-600">
                            {rowLabel}()
                          </span>
                        </div>
                        <div
                          className="grid gap-3"
                          style={{
                            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                          }}
                        >
                          {rowValues.map((value, columnIdx) => {
                            const wordsInBucket =
                              contributions?.[rowIdx]?.[columnIdx] ?? [];
                            const isHighlight = highlightColumn === columnIdx;
                            const wordFills = calculateWordFills(
                              wordsInBucket,
                              DEMO_BUCKET_MAX_FILL,
                            );

                            return (
                              <div
                                key={columnIdx}
                                className="relative flex flex-col items-center"
                              >
                                {isHighlight && selectedWord && (
                                  <div
                                    className={cn(
                                      'absolute -top-2 left-0 right-0 h-1',
                                      selectedWord.scheme.dot,
                                    )}
                                  />
                                )}
                                <div className="relative h-24 w-full">
                                  <BucketSVG
                                    fillColor="white"
                                    strokeColor="black"
                                    isHighlight={false}
                                    isActive={false}
                                    wordFills={wordFills}
                                    bucketId={`more-buckets-${rowIdx}-${columnIdx}-${columns}`}
                                  />
                                </div>
                                <div
                                  className={cn(
                                    'mt-2 text-center text-lg font-semibold',
                                    isHighlight && selectedWord
                                      ? selectedWord.scheme.text
                                      : 'text-gray-900',
                                  )}
                                >
                                  {formatNumber(value)}
                                </div>
                                <div className="mt-2 flex min-h-[24px] flex-wrap justify-center gap-1">
                                  {wordsInBucket.length > 0
                                    ? wordsInBucket.map((word) => (
                                        <span
                                          key={word.normalized}
                                          className="inline-flex items-center gap-1 text-xs font-medium"
                                        >
                                          <span
                                            className={cn(
                                              'px-2 py-0.5',
                                              word.scheme.chip,
                                            )}
                                          >
                                            {word.label}
                                          </span>
                                          <span className="text-gray-700">
                                            +{formatNumber(word.count)}
                                          </span>
                                        </span>
                                      ))
                                    : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HighFrequencyDemo() {
  const { counts } = useExactCounts();
  const peer = counts[stem('peer')] ?? 0;
  const like = counts[stem('like')] ?? 0;
  const total = peer + like;

  return (
    <div className="my-8 flex flex-col items-center font-mono">
      <div className="w-full max-w-3xl space-y-4">
        <div className="border border-gray-200 bg-white p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex flex-col items-center">
                <motion.div className="absolute -top-2.5 left-0 right-0 h-1 bg-amber-500" />
                <span className="border border-amber-300 bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-800">
                  peer
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span>
                Estimate:{' '}
                <span className="font-semibold text-amber-700">
                  {formatNumber(total)} times
                </span>
              </span>
              <span className="text-xl">😰</span>
            </div>
          </div>
          <div className="mt-6">
            <div className="flex flex-col items-center gap-6 md:flex-row md:justify-center">
              {/* Visual representation of counts */}
              <div className="flex items-end gap-4">
                <div className="flex flex-col items-center">
                  <div className="mb-2 text-xs font-medium text-amber-700">
                    peer
                  </div>
                  <div
                    className="w-16 bg-amber-300"
                    style={{ height: `${Math.max(4, peer / 50)}px` }}
                  />
                  <div className="mt-2 text-sm font-semibold text-gray-900">
                    {formatNumber(peer)}
                  </div>
                </div>
                <div className="flex flex-col items-center">
                  <div className="mb-2 text-xs font-medium text-fuchsia-700">
                    like
                  </div>
                  <div
                    className="w-16 bg-fuchsia-300"
                    style={{ height: `${Math.max(4, like / 50)}px` }}
                  />
                  <div className="mt-2 text-sm font-semibold text-gray-900">
                    {formatNumber(like)}
                  </div>
                </div>
              </div>
              {/* Arrow */}
              <div className="text-2xl text-gray-400">→</div>
              {/* Single bucket */}
              <div className="flex flex-col items-center">
                <div className="relative h-32 w-24">
                  <BucketSVG
                    fillColor="white"
                    strokeColor="black"
                    isHighlight={false}
                    isActive={false}
                    wordFills={[
                      {
                        word: {
                          label: 'peer',
                          normalized: 'peer',
                          index: 0,
                          count: peer,
                          scheme: COLOR_SCHEMES[1]!,
                        },
                        color: '#fcd34d',
                        fillRatio: peer / 10000,
                      },
                      {
                        word: {
                          label: 'like',
                          normalized: 'like',
                          index: 1,
                          count: like,
                          scheme: COLOR_SCHEMES[2]!,
                        },
                        color: '#f0abfc',
                        fillRatio: like / 10000,
                      },
                    ]}
                    bucketId="high-freq-bucket"
                  />
                </div>
                <div className="mt-2 text-center text-lg font-semibold text-amber-700">
                  {formatNumber(total)}
                </div>
                <div className="mt-2 flex flex-col items-center gap-1">
                  <div className="flex items-center gap-1 text-xs font-medium">
                    <span className="bg-amber-100 px-2 py-0.5 text-amber-800">
                      peer
                    </span>
                    <span className="text-gray-700">+{formatNumber(peer)}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs font-medium">
                    <span className="bg-fuchsia-100 px-2 py-0.5 text-fuchsia-800">
                      like
                    </span>
                    <span className="text-gray-700">+{formatNumber(like)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MoreRowsConfidenceDemo() {
  const [expanded, setExpanded] = useState(false);
  const sharedWords = ['castle', 'peer', 'like', 'wet'];
  const { counts } = useExactCounts();
  const defaultHashFn = hash32;

  const rows = expanded ? 2 : 1;
  const columns = 4;

  // Use custom biased hash function for this demo
  const hashFn = useMemo(() => {
    const biasedFn = BIASED_HASH_FUNCTIONS['rows-of-hashes'];
    if (!biasedFn) return defaultHashFn;
    return (word: string, seed: number) => biasedFn.fn(word, seed, columns);
  }, [defaultHashFn, columns]);

  const normalizedWords = useMemo(
    () =>
      sharedWords.map((word) => word.trim()).filter((word) => word.length > 0),
    [],
  );

  const wordEntries = useMemo<WordEntry[]>(() => {
    return normalizedWords.map((label, index) => {
      const normalized = stem(label);
      const scheme = COLOR_SCHEMES[index % COLOR_SCHEMES.length]!;
      const count = counts[normalized] ?? 0;
      return { index, label, normalized, scheme, count };
    });
  }, [counts, normalizedWords]);

  const contributions = useMemo(() => {
    if (!wordEntries.length) return null;
    const matrix: WordEntry[][][] = Array.from({ length: rows }, () =>
      Array.from({ length: columns }, () => [] as WordEntry[]),
    );
    for (const entry of wordEntries) {
      for (let rowIdx = 0; rowIdx < rows; rowIdx++) {
        const columnIdx = hashFn(entry.normalized, rowIdx) % columns;
        matrix[rowIdx]![columnIdx]!.push(entry);
      }
    }
    return matrix;
  }, [hashFn, wordEntries, rows, columns]);

  const finalBuckets = useMemo(() => {
    if (!contributions) return null;
    return contributions.map((row) =>
      row.map((bucket) => bucket.reduce((sum, entry) => sum + entry.count, 0)),
    );
  }, [contributions]);

  const selectedWord =
    wordEntries.find((entry) => entry.normalized === stem('peer')) ??
    wordEntries[0] ??
    null;

  const queryHighlights = useMemo(() => {
    if (!selectedWord || !hashFn || !finalBuckets || !contributions) {
      return [];
    }
    const highlights = Array.from({ length: rows }, (_, rowIdx) => {
      const columnIdx = hashFn(selectedWord.normalized, rowIdx) % columns;
      const value = finalBuckets[rowIdx]?.[columnIdx] ?? 0;
      const wordsInBucket =
        contributions[rowIdx]?.[columnIdx]?.map((entry) => entry) ?? [];
      return { rowIdx, columnIdx, value, words: wordsInBucket };
    });

    // Find the minimum value across all rows
    const minValue = highlights.reduce(
      (acc, { value }) => Math.min(acc, value),
      Number.POSITIVE_INFINITY,
    );

    // Add isMinimum flag to each highlight
    return highlights.map((h) => ({
      ...h,
      isMinimum: h.value === minValue,
    }));
  }, [columns, contributions, finalBuckets, hashFn, rows, selectedWord]);

  const estimateValue =
    queryHighlights.length > 0
      ? queryHighlights.reduce(
          (acc, { value }) => Math.min(acc, value),
          Number.POSITIVE_INFINITY,
        )
      : null;

  const displayBuckets = finalBuckets ?? createZeroMatrix(rows, columns);

  const ready = Boolean(contributions && finalBuckets);

  if (!ready) {
    return (
      <div className="my-6 flex flex-col items-center">
        <div className="w-full max-w-3xl space-y-4">
          <div className="rounded-3xl border-2 border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
            Loading sketch data&hellip;
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="my-8 space-y-6">
      <div className={cn('my-6 flex flex-col items-center font-mono')}>
        <div className="w-full max-w-3xl space-y-4">
          <div className="flex items-center justify-end gap-4">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex-shrink-0 border border-blue-500 bg-blue-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-600"
            >
              {expanded ? 'Remove 1 row' : 'Add 1 row'}
            </button>
          </div>
          <div className="border border-gray-200 bg-white p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap gap-3">
                {selectedWord && (
                  <div className="relative flex flex-col items-center">
                    <motion.div
                      layoutId="more-rows-indicator"
                      className={cn(
                        'absolute -top-2.5 left-0 right-0 h-1',
                        selectedWord.scheme.dot,
                      )}
                      transition={{
                        type: 'spring',
                        bounce: 0.2,
                        duration: 0.6,
                      }}
                    />
                    <span
                      className={cn(
                        'border-2 px-3 py-1.5 text-xs font-medium',
                        selectedWord.scheme.chip,
                        selectedWord.scheme.border,
                      )}
                    >
                      {selectedWord.label}
                    </span>
                  </div>
                )}
              </div>
              <div className="text-sm text-gray-600">
                Estimate:{' '}
                <span
                  className={cn('font-semibold', selectedWord?.scheme.text)}
                >
                  {formatNumber(
                    estimateValue === null || estimateValue === Infinity
                      ? 0
                      : estimateValue,
                  )}{' '}
                  times
                </span>
              </div>
            </div>
            <div className="mt-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key={rows}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-6"
                >
                  {displayBuckets.map((rowValues, rowIdx) => {
                    const rowLabel = `hash${rowIdx + 1}`;
                    const highlight = queryHighlights.find(
                      (item) => item.rowIdx === rowIdx,
                    );
                    const highlightColumn = highlight?.columnIdx ?? null;
                    const isMinimumRow = highlight?.isMinimum ?? false;
                    return (
                      <div key={rowIdx} className="relative">
                        <div className="mb-2 flex items-baseline justify-between">
                          <span className="font-mono text-sm font-semibold uppercase tracking-wide text-gray-600">
                            {rowLabel}()
                          </span>
                        </div>
                        <motion.div
                          className="grid gap-3"
                          style={{
                            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                          }}
                          initial={{ opacity: 0, y: -20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.5, ease: 'easeInOut' }}
                        >
                          {rowValues.map((value, columnIdx) => {
                            const wordsInBucket =
                              contributions?.[rowIdx]?.[columnIdx] ?? [];
                            const isHighlight = highlightColumn === columnIdx;
                            const wordFills = calculateWordFills(
                              wordsInBucket,
                              DEMO_BUCKET_MAX_FILL,
                            );

                            return (
                              <div
                                key={columnIdx}
                                className="relative flex flex-col items-center"
                              >
                                {isHighlight && selectedWord && (
                                  <div
                                    className={cn(
                                      'absolute -top-2 left-0 right-0 h-1',
                                      isMinimumRow
                                        ? selectedWord.scheme.dot
                                        : 'bg-gray-900',
                                    )}
                                  />
                                )}
                                <div className="relative h-24 w-full">
                                  <BucketSVG
                                    fillColor="white"
                                    strokeColor="black"
                                    isHighlight={false}
                                    isActive={false}
                                    wordFills={wordFills}
                                    bucketId={`more-rows-${rowIdx}-${columnIdx}`}
                                  />
                                </div>
                                <div
                                  className={cn(
                                    'mt-2 text-center text-lg font-semibold',
                                    isHighlight && selectedWord && isMinimumRow
                                      ? selectedWord.scheme.text
                                      : 'text-gray-900',
                                  )}
                                >
                                  {formatNumber(value)}
                                </div>
                                <div className="mt-2 flex min-h-[24px] flex-wrap justify-center gap-1">
                                  {wordsInBucket.length > 0
                                    ? wordsInBucket.map((word) => (
                                        <span
                                          key={word.normalized}
                                          className="inline-flex items-center gap-1 text-xs font-medium"
                                        >
                                          <span
                                            className={cn(
                                              'px-2 py-0.5',
                                              word.scheme.chip,
                                            )}
                                          >
                                            {word.label}
                                          </span>
                                          <span className="text-gray-700">
                                            +{formatNumber(word.count)}
                                          </span>
                                        </span>
                                      ))
                                    : null}
                                </div>
                              </div>
                            );
                          })}
                        </motion.div>
                      </div>
                    );
                  })}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ExactCountsGrowthDemo() {
  // Include some duplicates to show incrementing vs adding new keys
  const words = [
    'castle',
    'drooping',
    'like',
    'a',
    'drooping',
    'wet',
    'castle',
  ];
  const [step, setStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const stepDurationMs = 1000;

  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      setStep((prev) => {
        if (prev >= words.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, stepDurationMs);
    return () => clearInterval(timer);
  }, [isPlaying, words.length]);

  const handleReset = () => {
    setStep(0);
    setIsPlaying(false);
  };

  const handlePlay = () => {
    if (step >= words.length - 1) {
      setStep(1);
    } else {
      setStep((prev) => prev + 1);
    }
    setIsPlaying(true);
  };

  const visibleWords = words.slice(0, step + 1);
  const currentWord = words[step];
  const isComplete = step >= words.length - 1;

  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    visibleWords.forEach((word) => {
      const stemmed = stem(word);
      result[stemmed] = (result[stemmed] || 0) + 1;
    });
    return result;
  }, [visibleWords]);

  return (
    <div className="my-8 flex justify-center font-mono">
      <div className="w-full max-w-4xl space-y-4">
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={handleReset}
            className="border border-gray-300 bg-white px-4 py-1.5 text-sm font-semibold text-gray-900 transition-all hover:bg-gray-50"
          >
            Reset
          </button>
          <button
            onClick={handlePlay}
            disabled={isComplete}
            className={cn(
              'border px-4 py-1.5 text-sm font-semibold transition-all',
              isComplete
                ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                : 'border-gray-300 bg-white text-gray-900 hover:bg-gray-50',
            )}
          >
            Start
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {/* Words side */}
          <div className="flex flex-col border border-gray-200 bg-white p-4">
            <h3 className="mb-2 mt-2 text-center text-xl font-bold">words</h3>
            <div className="flex-1 space-y-2" style={{ minHeight: '230px' }}>
              {visibleWords.map((word, idx) => {
                const scheme = COLOR_SCHEMES[idx % COLOR_SCHEMES.length]!;
                const isNew = currentWord === word && idx === step;
                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-2"
                  >
                    <span className="text-green-600">+</span>
                    <span
                      className={cn(
                        'transition-colors',
                        isNew ? scheme.text : 'text-gray-700',
                      )}
                    >
                      {word}
                    </span>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* Counts side */}
          <div className="flex flex-col border border-gray-200 bg-white p-6">
            <h3 className="mb-2 mt-2 text-center text-xl font-bold">counts</h3>
            <div className="flex-1">
              <div className="text-gray-900">{'{'}</div>
              <div className="ml-4 space-y-1">
                {Object.entries(counts).map(([word, count]) => {
                  const wordIndex = words.findIndex((w) => stem(w) === word);
                  const scheme =
                    COLOR_SCHEMES[wordIndex % COLOR_SCHEMES.length]!;
                  const isCurrent = currentWord && stem(currentWord) === word;
                  const isNewKey = isCurrent && count === 1;
                  const isIncrementingKey = isCurrent && count > 1;

                  return (
                    <motion.div
                      key={word}
                      initial={isNewKey ? { opacity: 0, x: -10 } : {}}
                      animate={{ opacity: 1, x: 0 }}
                      className={cn(
                        'transition-colors',
                        isCurrent ? scheme.text : 'text-gray-700',
                      )}
                    >
                      {isNewKey && (
                        <span className="mr-1 font-bold text-green-600">+</span>
                      )}
                      "{word}":{' '}
                      <span
                        className={cn(
                          'font-bold',
                          isIncrementingKey ? scheme.text : 'text-gray-900',
                        )}
                      >
                        {count}
                      </span>
                    </motion.div>
                  );
                })}
              </div>
              <div className="text-gray-900">{'}'}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
