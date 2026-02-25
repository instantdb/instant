'use client';

import { use, useEffect, useState } from 'react';
import * as Babel from '@babel/standalone';
import React from 'react';
import { id as instantId, i, init } from '@instantdb/react';
import { db } from '@/lib/db';
import { UIMessage } from 'ai';
import {
  getLatestAssistantCode,
  sanitizeForExecution,
  stripMarkdownFences,
} from '@/lib/codeUtils';

export default function PreviewSubdomainPage({
  params,
}: {
  params: Promise<{ subdomain: string }>;
}) {
  const { subdomain: chatId } = use(params);
  const [error, setError] = useState<string | null>(null);
  const [Component, setComponent] = useState<React.ComponentType | null>(null);
  const [tailwindLoaded, setTailwindLoaded] = useState(false);


  const {
    data,
    isLoading,
    error: queryError,
  } = db.useQuery({
    chats: {
      $: { where: { id: chatId } },
      messages: {
        $: {
          where: { role: 'assistant' },
        },
      },
      previewApp: {},
    },
  });

  const app = data?.chats[0]?.previewApp;

  const codeMessage = data?.chats[0]?.messages?.[0];

  useEffect(() => {
    if (!isLoading) {
      const refreshThreshold = Date.now() + 1000 * 60 * 60 * 24;
      if (!app || new Date(app.expiresAt).getTime() < refreshThreshold) {
        fetch('/api/refresh-app', {
          method: 'POST',
          body: JSON.stringify({ chatId }),
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
  }, [isLoading, app, chatId]);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4';
    script.onload = () => setTailwindLoaded(true);
    document.head.appendChild(script);
    return () => {
      if (script.parentNode) script.parentNode.removeChild(script);
    };
  }, []);

  useEffect(() => {
    if (!codeMessage || !tailwindLoaded) return;

    const appId = app?.appId;

    if (!appId) {
      return;
    }

    try {
      const rawCode = getLatestAssistantCode([codeMessage] as UIMessage[]);
      const cleanCode = sanitizeForExecution(stripMarkdownFences(rawCode));

      const transformedCode = Babel.transform(cleanCode, {
        presets: ['react', 'typescript'],
        plugins: [['transform-modules-commonjs', { strict: false }]],
        filename: 'app.tsx',
        sourceType: 'module',
      }).code;

      if (!transformedCode) throw new Error('Failed to transform code');

      const evalBody = `
        const exports = {};
        const module = { exports };

        const require = function(name) {
          const modules = {
            'react': React,
            '@instantdb/react': { id, i, init, InstaQLEntity: {} }
          };

          if (modules[name]) return modules[name];
          throw new Error('Module not found: ' + name);
        };

        ${transformedCode}

        return module.exports.default || module.exports || exports.default || exports.App || App;
      `;

      const evalFunc = new Function(
        'React',
        'instantAppId',
        'id',
        'i',
        'init',
        evalBody,
      );
      const AppComponent = evalFunc(React, appId || '', instantId, i, init);

      if (typeof AppComponent !== 'function') {
        throw new Error('Code did not export a valid React component');
      }

      setComponent(() => AppComponent);
      setError(null);
    } catch (err) {
      console.error('Preview evaluation error:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to evaluate application.',
      );
    }
  }, [app?.appId, codeMessage, tailwindLoaded, isLoading]);

  if (queryError || error) {
    return (
      <div className="relative z-[1000] h-screen overflow-auto bg-white p-8 font-sans">
        <h1 className="mb-2 text-xl font-bold text-red-600">Preview Error</h1>
        <pre className="overflow-auto rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {queryError?.message || error}
        </pre>
      </div>
    );
  }

  if (!Component)
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-white">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-gray-600" />
        <p className="text-sm text-gray-500">
          {isLoading || codeMessage
            ? 'Loading preview...'
            : 'Generating code...'}
        </p>
      </div>
    );

  return (
    <div className="h-screen w-screen bg-white">
      <Component />
    </div>
  );
}
