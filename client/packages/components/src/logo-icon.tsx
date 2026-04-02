import React from 'react';
import { cn } from './cn';

export function LogoIcon({
  size = 'mini',
  className,
}: {
  size?: 'mini' | 'normal';
  className?: string;
}) {
  const sizeToClass = {
    mini: 'h-4 w-4',
    normal: 'h-6 w-6',
  };

  return (
    <img
      src="/img/icon/logo-512.svg"
      className={cn(sizeToClass[size], className)}
    />
  );
}
