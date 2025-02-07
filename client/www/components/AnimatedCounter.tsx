import { MotionValue, motion, useSpring, useTransform } from 'motion/react';
import { useEffect } from 'react';

export default function AnimatedCounter({
  number,
  height,
}: {
  number: number;
  height: number;
}) {
  const digits = `${number}`.split('');

  return (
    <div className="flex space-x-2 overflow-hidden">
      {digits.map((digit, index) => {
        return <Digit key={index} value={+digit} height={height} />;
      })}
    </div>
  );
}

function Digit({ value, height }: { value: number; height: number }) {
  const animatedValue = useSpring(value);
  useEffect(() => {
    animatedValue.set(value);
  }, [animatedValue, value]);
  const padding = 10;
  const fontSize = height - padding;
  return (
    <div
      className="font-mono border border-black leading-none flex items-center justify-center"
      style={{ width: 28, height: height, fontSize, padding }}
    >
      <div style={{ height }} className="relative w-[1ch] tabular-nums">
        {Array.from({ length: 10 }, (_, i) => i).map((digit) => (
          <Number
            key={digit}
            mv={animatedValue}
            number={digit}
            height={height}
          />
        ))}
      </div>
    </div>
  );
}

function Number({
  mv,
  number,
  height,
}: {
  mv: MotionValue;
  number: number;
  height: number;
}) {
  const y = useTransform(mv, (latest) => {
    const placeValue = latest % 10;
    const offset = (10 + number - placeValue) % 10;
    let memo = offset * height;
    if (offset > 5) {
      memo -= 10 * height;
    }
    return memo;
  });

  return (
    <motion.span
      style={{ y }}
      className="absolute inset-0 flex items-center justify-center"
    >
      {number}
    </motion.span>
  );
}
