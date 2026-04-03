'use client';

import {
  AnimatePresence,
  MotionValue,
  motion,
  useSpring,
  useTransform,
} from 'motion/react';
import { useEffect, useRef, useState } from 'react';

export function RollingNumber({
  value,
  format,
}: {
  value: number;
  format?: (n: number) => string;
}) {
  if (format) {
    return <FormattedRolling value={value} format={format} />;
  }

  const numDigits = String(value).length;
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
  }, []);

  return (
    <motion.span className="inline-flex flex-row-reverse tabular-nums" layout>
      <AnimatePresence initial={false}>
        {Array.from({ length: numDigits }, (_, i) => (
          <OdometerDigit
            key={i}
            value={value}
            place={i}
            rollIn={mounted.current}
          />
        ))}
      </AnimatePresence>
    </motion.span>
  );
}

function FormattedRolling({
  value,
  format,
}: {
  value: number;
  format: (n: number) => string;
}) {
  const spring = useSpring(value, { stiffness: 80, damping: 20 });
  const [current, setCurrent] = useState(value);

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  useEffect(() => {
    return spring.on('change', (v) => {
      setCurrent(Math.max(0, Math.round(v)));
    });
  }, [spring]);

  const display = format(current);
  return (
    <span className="inline-flex tabular-nums">
      {display.split('').map((char, i) => (
        <span
          key={i}
          className={
            char >= '0' && char <= '9'
              ? 'inline-block w-[1ch] text-center'
              : undefined
          }
        >
          {char}
        </span>
      ))}
    </span>
  );
}

// Each digit gets its own spring that tracks floor(value / 10^place).
// The display digit is springValue % 10, which naturally wraps (e.g. 9→10 shows 9→0).
// This means going 1505→1506 only animates the ones spring,
// while 1000→2000 makes hundreds spin 10→20 (one full 0→9→0 rotation), etc.
function OdometerDigit({
  value,
  place,
  rollIn,
}: {
  value: number;
  place: number;
  rollIn: boolean;
}) {
  const divisor = Math.pow(10, place);
  const target = Math.floor(value / divisor);

  // When rollIn is true (digit added after initial render), start from 0
  // so the digit rolls up from 0 to its value
  const initialValue = rollIn ? target - (target % 10) : target;
  const spring = useSpring(initialValue, { stiffness: 80, damping: 20 });

  useEffect(() => {
    spring.set(target);
  }, [spring, target]);

  const digitValue = useTransform(spring, (v) => v % 10);

  return (
    <motion.span
      layout
      initial={{ clipPath: 'inset(100% 0 0 0)' }}
      animate={{ clipPath: 'inset(0% 0 0 0)' }}
      exit={{ clipPath: 'inset(100% 0 0 0)' }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="relative inline-block w-[1ch] align-top overflow-hidden leading-[1]"
    >
      {/* Invisible digit sets the natural height */}
      <span className="invisible" aria-hidden>0</span>
      {Array.from({ length: 10 }, (_, i) => (
        <OdometerSlot key={i} mv={digitValue} number={i} />
      ))}
    </motion.span>
  );
}

function OdometerSlot({
  mv,
  number,
}: {
  mv: MotionValue<number>;
  number: number;
}) {
  const y = useTransform(mv, (latest) => {
    const offset = (10 + number - latest) % 10;
    let pct = offset * 100;
    if (offset > 5) {
      pct -= 1000;
    }
    return `${pct}%`;
  });

  return (
    <motion.span
      style={{ y }}
      className="absolute inset-x-0 top-0 flex h-full items-center justify-center"
      aria-hidden
    >
      {number}
    </motion.span>
  );
}
