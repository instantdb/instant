'use client';

import * as HeadlessToggleGroup from '@radix-ui/react-toggle-group';
import { cn } from '@/lib/cn';

export function ToggleGroup({
  items,
  onChange,
  selectedId,
  ariaLabel,
}: {
  items: { id: string; label: string }[];
  selectedId?: string;
  ariaLabel?: string;
  onChange: (tab: { id: string; label: string }) => void;
}) {
  return (
    <HeadlessToggleGroup.Root
      value={selectedId}
      onValueChange={(id) => {
        if (!id) return;
        const item = items.find((item) => item.id === id);
        if (!item) return;
        onChange(item);
      }}
      className="flex gap-1 rounded-sm border border-gray-300 bg-gray-200 p-0.5 text-sm dark:border-neutral-700 dark:bg-neutral-800"
      type="single"
      defaultValue="center"
      aria-label={ariaLabel}
    >
      {items.map((item) => (
        <HeadlessToggleGroup.Item
          key={item.id}
          className={cn(
            'flex-1 rounded-sm p-0.5',
            selectedId === item.id
              ? 'bg-white dark:bg-neutral-600/50'
              : 'bg-gray-200 dark:bg-transparent',
          )}
          value={item.id}
          aria-label={item.label}
        >
          {item.label}
        </HeadlessToggleGroup.Item>
      ))}
    </HeadlessToggleGroup.Root>
  );
}
