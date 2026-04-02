import { cn } from '@/lib/cn';
import { createElement, ReactNode } from 'react';

export function twel<T = {}>(el: string, cls: string) {
  return function (props: { className?: string; children: ReactNode } & T) {
    return createElement(el, {
      ...props,
      className: cn(cls, props.className),
    });
  };
}

export const BlockHeading = twel('div', 'text-md font-bold');
