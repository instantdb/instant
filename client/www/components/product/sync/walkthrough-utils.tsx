import { AnimatePresence, motion } from 'motion/react';

// -- Types -------------------------------------------------------------------

export type BallColor = '#d1d5db' | '#3b82f6' | '#ef4444';

export const GRAY: BallColor = '#d1d5db';
export const BLUE: BallColor = '#3b82f6';
export const RED: BallColor = '#ef4444';

export interface ClientState {
  serverUpdate: BallColor | null;
  pendingMut: BallColor | null;
}

export type DotPosition = 'pending' | 'waiting' | 'server' | 'gone';

export interface MutDot {
  color: BallColor;
  position: DotPosition;
}

// -- Shared layout constants -------------------------------------------------

export const COL_W = 130;
export const BAR_H = 20;
export const BOX_H = 110;
export const GAP = 10;

// -- Helpers -----------------------------------------------------------------

export function ballColor(c: ClientState): BallColor {
  return c.pendingMut ?? c.serverUpdate ?? GRAY;
}

// -- Components --------------------------------------------------------------

export function LayerBar({ color }: { color: BallColor | null }) {
  return (
    <div
      className="flex items-center justify-center rounded border border-gray-300 bg-white"
      style={{ height: BAR_H, width: COL_W }}
    >
      <AnimatePresence>
        {color && (
          <motion.div
            key="dot"
            className="rounded-full"
            style={{
              width: BAR_H - 8,
              height: BAR_H - 8,
              backgroundColor: color,
            }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.3 }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export function ClientColumn({
  name,
  state,
}: {
  name: string;
  state: ClientState;
}) {
  const ball = ballColor(state);
  return (
    <div className="flex flex-col items-center" style={{ width: COL_W }}>
      <p className="mb-1 self-start text-sm text-gray-500">Server Result</p>
      <LayerBar color={state.serverUpdate} />
      <p className="mt-2 mb-1 self-start text-sm text-gray-500">
        Pending Mutations
      </p>
      <LayerBar color={state.pendingMut} />
      <div
        className="mt-2 flex items-center justify-center rounded-lg border border-gray-200 bg-white"
        style={{ width: COL_W, height: BOX_H }}
      >
        <motion.div
          className="rounded-full"
          style={{ width: 44, height: 44 }}
          animate={{ backgroundColor: ball }}
          transition={{ duration: 0.4 }}
        />
      </div>
      <p className="mt-2 text-base text-gray-500">{name}</p>
    </div>
  );
}

export function MutationDot({
  dot,
  pendingPos,
  waitPos,
  serverPos,
}: {
  dot: MutDot;
  pendingPos: { cx: number; cy: number };
  waitPos: { cx: number; cy: number };
  serverPos: { cx: number; cy: number };
}) {
  const pos =
    dot.position === 'pending'
      ? pendingPos
      : dot.position === 'waiting'
        ? waitPos
        : serverPos; // 'server' or 'gone'

  return (
    <motion.circle
      r={5}
      fill={dot.color}
      initial={{ cx: pendingPos.cx, cy: pendingPos.cy, opacity: 0 }}
      animate={{
        cx: pos.cx,
        cy: pos.cy,
        opacity: dot.position === 'gone' ? 0 : 1,
      }}
      transition={{ duration: 0.8, ease: 'easeInOut' }}
    />
  );
}

export function TravelingDot({
  x1,
  y1,
  x2,
  y2,
  color,
  delay = 0,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: BallColor;
  delay?: number;
}) {
  return (
    <motion.circle
      r={5}
      fill={color}
      initial={{ cx: x1, cy: y1, opacity: 0 }}
      animate={{ cx: x2, cy: y2, opacity: [0, 1, 1, 0] }}
      transition={{ duration: 0.8, delay, ease: 'easeInOut' }}
    />
  );
}
