'use client';
import type { ClassValue } from 'clsx';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';
import { createElement, type ReactNode } from 'react';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function twel<T = {}>(el: string, cls: ClassValue[] | ClassValue) {
  return function (props: { className?: string; children: ReactNode } & T) {
    return createElement(el, {
      ...props,
      className: cn(cls, props.className),
    });
  };
}
