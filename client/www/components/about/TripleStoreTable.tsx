import { motion } from 'motion/react';

export function TripleStoreTable({
  triples,
  highlightedKeys,
  highlightMethod = 'slide',
  truncateValues,
}: {
  triples: [string, string, string | boolean][];
  highlightedKeys?: Set<string>;
  highlightMethod?: 'flash' | 'slide';
  truncateValues?: boolean;
}) {
  // Find the range of highlighted rows for the sliding overlay
  let firstIdx = -1;
  let lastIdx = -1;
  if (
    highlightMethod === 'slide' &&
    highlightedKeys &&
    highlightedKeys.size > 0
  ) {
    triples.forEach(([e, a], i) => {
      if (highlightedKeys.has(`${e}-${a}`)) {
        if (firstIdx === -1) firstIdx = i;
        lastIdx = i;
      }
    });
  }
  const hasSlide = firstIdx !== -1;
  const highlightCount = hasSlide ? lastIdx - firstIdx + 1 : 0;

  const formatValue = (v: string | boolean) => {
    const s = String(v);
    return truncateValues && s.length > 12 ? s.slice(0, 9) + '...' : s;
  };

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 bg-gray-50/80 px-4 py-2.5 text-xs font-medium tracking-wider text-gray-400 uppercase">
        Triple Store
      </div>
      <div className="grid grid-cols-3 border-b border-gray-100 text-xs text-gray-400">
        <div className="px-4 py-2 font-medium">entity</div>
        <div className="px-4 py-2 font-medium">attribute</div>
        <div className="px-4 py-2 font-medium">value</div>
      </div>
      <div className="relative">
        {hasSlide && (
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bg-orange-50"
            style={{
              height: `${(highlightCount / triples.length) * 100}%`,
            }}
            animate={{
              top: `${(firstIdx / triples.length) * 100}%`,
            }}
            transition={{
              type: 'spring',
              stiffness: 400,
              damping: 30,
            }}
          />
        )}
        {triples.map(([e, a, v]) => {
          const key = `${e}-${a}`;
          const isHighlighted =
            highlightMethod === 'flash' && highlightedKeys?.has(key);
          return (
            <motion.div
              key={key}
              initial={false}
              animate={
                isHighlighted
                  ? {
                      backgroundColor: [
                        'rgba(249, 115, 22, 0)',
                        'rgba(249, 115, 22, 0.1)',
                        'rgba(249, 115, 22, 0)',
                      ],
                    }
                  : { backgroundColor: 'rgba(249, 115, 22, 0)' }
              }
              transition={{ duration: 1.2 }}
              className="relative grid grid-cols-3 border-b border-gray-50"
            >
              <div className="px-4 py-1.5 font-mono text-xs text-gray-500">
                {e}
              </div>
              <div className="px-4 py-1.5 font-mono text-xs text-gray-500">
                {a}
              </div>
              <div className="px-4 py-1.5 font-mono text-xs text-gray-700">
                {formatValue(v)}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
