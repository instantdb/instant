'use client';

import { useRef, useState, useCallback, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';

type Particle = {
  id: number;
  x: number;
  y: number;
  size: number;
  char: string;
};

const STAR_CHARS = ['✦', '★', '⭑', '✦', '★'];

export function useStarBurst() {
  const [particles, setParticles] = useState<Particle[]>([]);
  const nextId = useRef(0);

  const burst = useCallback(() => {
    const newParticles: Particle[] = Array.from({ length: 10 }, (_, i) => {
      const angle = Math.random() * Math.PI * 2;
      const distance = 20 + Math.random() * 40;
      return {
        id: nextId.current++,
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
        size: 0.5 + Math.random() * 0.7,
        char: STAR_CHARS[Math.floor(Math.random() * STAR_CHARS.length)],
      };
    });
    setParticles((p) => [...p, ...newParticles]);
  }, []);

  const removeParticle = useCallback((id: number) => {
    setParticles((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return { particles, burst, removeParticle };
}

export function StarBurst({
  particles,
  removeParticle,
  children,
}: {
  particles: Particle[];
  removeParticle: (id: number) => void;
  children: ReactNode;
}) {
  return (
    <span className="relative inline-block">
      <AnimatePresence>
        {particles.length > 0 && (
          <motion.span
            key="pulse"
            className="pointer-events-none absolute inset-0 rounded bg-yellow-300/20"
            initial={{ opacity: 1, scale: 1 }}
            animate={{ opacity: 0, scale: 1.3 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          />
        )}
      </AnimatePresence>
      {children}
      <AnimatePresence>
        {particles.map((p) => (
          <motion.span
            key={p.id}
            className="pointer-events-none absolute left-1/2 top-1/2 text-yellow-400"
            style={{ fontSize: `${p.size}em` }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 0 }}
            animate={{ x: p.x, y: p.y, opacity: 0, scale: 1.2 }}
            transition={{ duration: 0.6 + Math.random() * 0.3, ease: 'easeOut' }}
            onAnimationComplete={() => removeParticle(p.id)}
          >
            {p.char}
          </motion.span>
        ))}
      </AnimatePresence>
    </span>
  );
}
