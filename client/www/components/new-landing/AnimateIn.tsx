'use client';

import { ReactNode } from 'react';
import { motion } from 'motion/react';

interface AnimateInProps {
  children: ReactNode;
  delay?: number;
  className?: string;
}

export function AnimateIn({
  children,
  delay = 0,
  className = '',
}: AnimateInProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.7, ease: 'easeOut', delay: delay / 1000 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
