'use client';
import { FrameworkClient, FrameworkConfig } from '@instantdb/core';
import React, { useRef } from 'react';
import {
  createHydrationStreamProvider,
  isServer,
} from './HydrationStreamProvider.tsx';

type InstantSuspenseProviderProps = {
  nonce?: string;
  children: React.ReactNode;
} & FrameworkConfig<any>;

const stream = createHydrationStreamProvider<any>();

export const SuspsenseQueryContext = React.createContext<any>(null);

export const InstantSuspenseProvider = (
  props: InstantSuspenseProviderProps,
) => {
  const [trackedKeys] = React.useState(() => new Set<string>());
  const clientRef = useRef<FrameworkClient>();

  // Initialize client only once
  if (!clientRef.current) {
    clientRef.current = new FrameworkClient({
      ...props,
    });
  }

  const cacheRef = React.useRef<
    Map<
      string,
      {
        status: 'pending' | 'success' | 'error';
        promise: Promise<any>;
        data?: any;
        error?: any;
      }
    >
  >(new Map());

  const getKey = (q: any) => {
    try {
      if (q && typeof q === 'object' && 'queryHash' in q) {
        return (q as any).queryHash as string;
      }
      return JSON.stringify(q);
    } catch {
      return String(q);
    }
  };

  const useSuspenseQuery = React.useCallback((query: any) => {
    const key = getKey(query);
    let entry = cacheRef.current.get(key);

    if (!entry) {
      const newEntry: {
        status: 'pending' | 'success' | 'error';
        promise: Promise<any>;
        data?: any;
        error?: any;
      } = {
        status: 'pending',
        promise: Promise.resolve(),
      };

      newEntry.promise = clientRef
        .current!.getTriplesAndQueryResult(query)
        .then((data: any) => {
          console.log('data from server', data);
          newEntry.status = 'success';
          newEntry.data = data;
          return data;
        })
        .catch((err: any) => {
          console.error(err);
          newEntry.status = 'error';
          newEntry.error = err;
          throw err;
        });

      cacheRef.current.set(key, newEntry);
      entry = newEntry;
    }

    if (entry.status === 'pending') {
      throw entry.promise;
    }

    if (entry.status === 'error') {
      throw entry.error;
    }

    return entry.data;
  }, []); // Empty dependency array - this function should be stable

  return (
    <SuspsenseQueryContext.Provider value={useSuspenseQuery}>
      {props.children}
    </SuspsenseQueryContext.Provider>
  );
};
