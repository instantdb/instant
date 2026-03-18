import { useEffect, useState } from 'react';

export function ConnectorLine({
  containerRef,
  fromRef,
  toRef,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  fromRef: React.RefObject<HTMLDivElement | null>;
  toRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [line, setLine] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);

  useEffect(() => {
    const update = () => {
      const container = containerRef.current;
      const from = fromRef.current;
      const to = toRef.current;
      if (!container || !from || !to) return;

      const cr = container.getBoundingClientRect();
      const fr = from.getBoundingClientRect();
      const tr = to.getBoundingClientRect();

      const isStacked = fr.bottom < tr.top - 4;

      const next = isStacked
        ? {
            x1: fr.left - cr.left + fr.width / 2,
            y1: fr.bottom - cr.top,
            x2: tr.left - cr.left + tr.width / 2,
            y2: tr.top - cr.top,
          }
        : {
            x1: fr.right - cr.left,
            y1: fr.top - cr.top + fr.height / 2,
            x2: tr.left - cr.left,
            y2: tr.top - cr.top + tr.height / 2,
          };

      setLine((prev) =>
        prev &&
        prev.x1 === next.x1 &&
        prev.y1 === next.y1 &&
        prev.x2 === next.x2 &&
        prev.y2 === next.y2
          ? prev
          : next,
      );
    };

    update();

    const ro =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (ro) {
      [containerRef.current, fromRef.current, toRef.current].forEach(
        (n) => n && ro.observe(n),
      );
    }
    window.addEventListener('resize', update);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  if (!line) return null;

  return (
    <svg
      aria-hidden="true"
      width="100%"
      height="100%"
      className="pointer-events-none absolute inset-0 z-0"
    >
      <line
        x1={line.x1}
        y1={line.y1}
        x2={line.x2}
        y2={line.y2}
        stroke="#d1d5db"
        strokeWidth="2"
      />
    </svg>
  );
}
