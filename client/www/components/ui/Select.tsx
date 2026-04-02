'use client';

import { ReactNode } from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { cn } from '@/lib/cn';

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="m19.5 8.25-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

export function Select<Value extends string | boolean>({
  value,
  options,
  className,
  onChange,
  disabled,
  emptyLabel,
  noOptionsLabel,
  tabIndex,
  title,
  contentClassName,
  visibleValue,
}: {
  value?: Value;
  options: { label: string | ReactNode; value: Value }[];
  className?: string;
  onChange: (option?: { label: string | ReactNode; value: Value }) => void;
  disabled?: boolean;
  emptyLabel?: string | ReactNode;
  noOptionsLabel?: string | ReactNode;
  tabIndex?: number;
  title?: string | undefined;
  contentClassName?: string;
  visibleValue?: ReactNode;
}) {
  return (
    <SelectPrimitive.Root
      disabled={disabled}
      onValueChange={(value) => {
        const o = options.find((o) => o.value === value);
        onChange(o);
      }}
      value={value?.toString() ?? ''}
    >
      <SelectPrimitive.Trigger
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm shadow-xs outline-hidden disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1',
          className,
        )}
        title={title}
        tabIndex={tabIndex}
      >
        <SelectPrimitive.Value placeholder={emptyLabel}>
          {visibleValue}
        </SelectPrimitive.Value>
        <SelectPrimitive.Icon asChild>
          <ChevronDownIcon className="h-4 w-4 opacity-50" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className={cn(
            'relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-sm border border-gray-300 bg-white shadow-md animate-in fade-in-0 zoom-in-95',
            contentClassName,
          )}
          position="popper"
          sideOffset={4}
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value?.toString()}
                value={option.value?.toString()}
                className="relative flex w-full cursor-default items-center rounded-xs py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 focus:bg-gray-100"
              >
                <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
                  <SelectPrimitive.ItemIndicator>
                    <CheckIcon className="h-4 w-4" />
                  </SelectPrimitive.ItemIndicator>
                </span>
                <SelectPrimitive.ItemText>
                  {option.label}
                </SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
            {options.length === 0 && noOptionsLabel}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
