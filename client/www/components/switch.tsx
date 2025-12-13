'use client';

import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from './ui';

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'focus-visible:border-ring focus-visible:ring-ring/50 peer inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-2xs outline-hidden transition-all focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-neutral-800 data-[state=unchecked]:bg-neutral-300 dark:border dark:border-neutral-600 dark:data-[state=checked]:border-transparent dark:data-[state=checked]:bg-white dark:data-[state=unchecked]:bg-neutral-700',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          'pointer-events-none block h-4 w-4 rounded-full border-transparent bg-white ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=checked]:bg-white data-[state=unchecked]:translate-x-0 dark:bg-neutral-200 dark:data-[state=checked]:bg-neutral-600 dark:data-[state=unchecked]:bg-neutral-200',
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
