'use client';

import { Children, isValidElement } from 'react';
import useLocalStorage from '@/lib/hooks/useLocalStorage';

const LANGUAGE_LABELS = {
  bash: 'Bash',
  c: 'C',
  csharp: 'C#',
  cs: 'C#',
  cpp: 'C++',
  clojure: 'Clojure',
  elixir: 'Elixir',
  go: 'Go',
  haskell: 'Haskell',
  java: 'Java',
  javascript: 'JavaScript',
  js: 'JavaScript',
  jsx: 'JavaScript',
  kotlin: 'Kotlin',
  lua: 'Lua',
  ocaml: 'OCaml',
  php: 'PHP',
  python: 'Python',
  py: 'Python',
  ruby: 'Ruby',
  rb: 'Ruby',
  rust: 'Rust',
  rs: 'Rust',
  scala: 'Scala',
  shell: 'Shell',
  sh: 'Shell',
  swift: 'Swift',
  typescript: 'TypeScript',
  ts: 'TypeScript',
  tsx: 'TypeScript',
};

function languageLabel(language) {
  if (!language) return 'Code';
  return (
    LANGUAGE_LABELS[language.toLowerCase()] ??
    language.charAt(0).toUpperCase() + language.slice(1)
  );
}

export function LanguageTabs({ children, storageKey, defaultLanguage }) {
  const items = Children.toArray(children).filter(
    (child) => isValidElement(child) && child.props && child.props.language,
  );

  const fallback = defaultLanguage || items[0]?.props?.language || '';
  const [selected, setSelected] = useLocalStorage(
    `language-tabs-${storageKey}`,
    fallback,
  );

  if (items.length === 0) return null;

  const activeIdx = Math.max(
    0,
    items.findIndex((item) => item.props.language === selected),
  );
  const active = items[activeIdx];

  return (
    <div className="relative my-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="flex border-b border-gray-200 bg-gray-50">
        {items.map((item, idx) => {
          const lang = item.props.language;
          const label = languageLabel(lang);
          const isActive = idx === activeIdx;
          return (
            <button
              key={lang ?? idx}
              type="button"
              onClick={() => setSelected(lang)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? '-mb-[2px] border-b-2 border-blue-500 bg-white text-gray-900'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div className="[&_pre]:!my-0">{active}</div>
    </div>
  );
}
