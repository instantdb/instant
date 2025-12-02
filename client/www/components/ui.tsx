import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  Select as BaseSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/select';
import { rosePineDawnTheme } from '@/lib/rosePineDawnTheme';

import {
  MouseEventHandler,
  ReactNode,
  createElement,
  useEffect,
  useRef,
  useState,
  Fragment,
  PropsWithChildren,
  ComponentProps,
  CSSProperties,
} from 'react';
import {
  DialogPanel,
  Dialog as HeadlessDialog,
  Popover,
  PopoverButton,
  PopoverPanel,
} from '@headlessui/react';
import * as HeadlessToggleGroup from '@radix-ui/react-toggle-group';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import Highlight, { defaultProps, Prism } from 'prism-react-renderer';

if (typeof global !== 'undefined') {
  (global as any).Prism = Prism;
} else {
  (window as any).Prism = Prism;
}

require('prismjs/components/prism-clojure');

import { ClipboardDocumentIcon } from '@heroicons/react/24/solid';
import copy from 'copy-to-clipboard';
import Link from 'next/link';

import { ui } from '@instantdb/components';

import { Editor, Monaco, OnMount } from '@monaco-editor/react';

export const {
  Button,
  Badge,
  BlockHeading,
  Content,
  Divider,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Group,
  Hint,
  IconButton,
  InfoTip,
  Label,
  LogoIcon,
  ScreenHeading,
  SectionHeading,
  Stack,
  SubsectionHeading,
  Tooltip,
  TooltipContent,
  ActionButton,
  Checkbox,
  Copyable,
  Copytext,
  Dialog,
  FullscreenLoading,
  ProgressButton,
  Select,
  SmallCopyable,
  TextArea,
  TextInput,
  ToggleCollection,
  ToggleGroup,
  cn,
  redactedValue,
  twel,
  useDialog,
  TooltipProvider,
  TooltipTrigger,
} = ui;

// content

// controls

export type TabItem = {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  link?: { href: string; target?: '_blank' };
};

export type TabButton = Omit<TabItem, 'link'>;

export function NavTabBar({
  className,
  selectedId,
  tabs,
  disabled,
  onSelect,
}: {
  className?: string;
  tabs: TabItem[];
  selectedId: string;
  disabled?: boolean;
  onSelect: (tab: TabButton) => void;
}) {
  return (
    <div
      className={clsx(
        'no-scrollbar flex flex-row gap-4 overflow-x-auto border-b py-1',
        className,
      )}
    >
      {tabs.map((t) =>
        t.link ? (
          <Link
            key={t.id}
            {...t.link}
            rel="noopener noreferer"
            className={clsx(
              'flex cursor-pointer rounded bg-none p-2 py-0.5 whitespace-nowrap disabled:text-gray-400',
              {
                'bg-gray-200': selectedId === t.id && !disabled,
              },
            )}
          >
            {t.label}
          </Link>
        ) : (
          <button
            key={t.id}
            disabled={disabled}
            onClick={() => onSelect(t)}
            className={clsx(
              'flex cursor-pointer rounded bg-none whitespace-nowrap decoration-gray-400 transition-colors hover:underline disabled:text-gray-400',
              {
                'underline decoration-[#606AF4]! decoration-2':
                  selectedId === t.id && !disabled,
              },
            )}
          >
            {t.label}
          </button>
        ),
      )}
    </div>
  );
}

export function TabBar({
  className,
  selectedId,
  tabs,
  disabled,
  onSelect,
}: {
  className?: string;
  tabs: TabItem[];
  selectedId: string;
  disabled?: boolean;
  onSelect: (tab: TabButton) => void;
}) {
  return (
    <div
      className={clsx(
        'no-scrollbar flex flex-row gap-0.5 overflow-x-auto border-b px-2 py-1 dark:border-b-neutral-700',
        className,
      )}
    >
      {tabs.map((t) =>
        t.link ? (
          <Link
            key={t.id}
            {...t.link}
            rel=""
            className={clsx(
              'flex cursor-pointer rounded bg-none px-4 py-0.5 whitespace-nowrap hover:bg-gray-100 disabled:text-gray-400 dark:hover:bg-neutral-600',
              {
                'bg-gray-200 dark:bg-neutral-700':
                  selectedId === t.id && !disabled,
              },
            )}
          >
            {t.label}
          </Link>
        ) : (
          <button
            key={t.id}
            disabled={disabled}
            onClick={() => onSelect(t)}
            className={clsx(
              'flex cursor-pointer rounded bg-none px-4 py-0.5 whitespace-nowrap hover:bg-gray-100 disabled:text-gray-400 dark:hover:bg-neutral-600',
              {
                'bg-gray-200 dark:bg-neutral-700':
                  selectedId === t.id && !disabled,
              },
            )}
          >
            {t.label}
          </button>
        ),
      )}
    </div>
  );
}

// abstractions

/**
 * @deprecated Use `useForm` with a regular `<form>` and` <Button type="submit">` instead
 */
export function ActionForm({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <form onSubmit={(e) => e.preventDefault()} className={className}>
      {children}
    </form>
  );
}

function createErrorMesageFromEx(errorMessage: string, error: any): string {
  let base = errorMessage;

  const topLevelMessage = error?.message as string | undefined;
  const hintMessage = error?.hint?.errors?.[0]?.message as string | undefined;

  const hasTopLevelMessage = topLevelMessage?.length;
  if (hasTopLevelMessage) {
    base += `\n${topLevelMessage}`;
  }

  const hasHint = hintMessage?.length;
  // Sometimes, the `hint` is directly embedded in the top-level message,
  // so we avoid repeating it here.
  const hintIsDistinct =
    hasHint &&
    (!hasTopLevelMessage || topLevelMessage.indexOf(hintMessage) === -1);

  if (hintIsDistinct) {
    base += `\n${hintMessage}`;
  }

  return base;
}

export function CodeEditor(props: {
  value: string;
  language: string;
  onChange: (value: string) => void;
  schema?: object;
  onMount?: OnMount;
  path?: string;
  tabIndex?: number;
  loading?: boolean;
  readOnly?: boolean;
  className?: string;
}) {
  const { darkMode } = useDarkMode();
  return (
    <Editor
      theme={darkMode ? 'vs-dark' : 'vs-light'}
      className={cn(
        props.loading ? 'animate-pulse' : undefined,
        props.className,
      )}
      height={'100%'}
      language={props.language}
      value={props.value ?? ''}
      defaultPath={props.path}
      options={{
        scrollBeyondLastLine: false,
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        minimap: { enabled: false },
        automaticLayout: true,
        tabIndex: props.tabIndex,
        readOnly: props.readOnly,
      }}
      onChange={(value) => {
        props.onChange(value || '');
      }}
      onMount={props.onMount}
      beforeMount={(monaco) => {}}
      loading={<FullscreenLoading />}
    />
  );
}

export function JSONEditor(props: {
  value: string;
  label: ReactNode;
  onSave: (value: string) => void;
  schema?: object;
}) {
  const [draft, setDraft] = useState(props.value);
  const editorId = useId();
  const filePath = `json-editor-${editorId}.json`;

  const [monacoInstance, setMonacomonacoInstance] = useState<
    Monaco | undefined
  >(undefined);
  useMonacoJSONSchema(filePath, monacoInstance, props.schema);
  useEffect(() => {
    setDraft(props.value);
  }, [props.value]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-gray-50 dark:bg-[#252525]">
      <div className="flex items-center justify-between gap-4 border-b px-4 py-2 dark:border-b-neutral-700">
        <div className="font-mono">{props.label}</div>
        <Button size="mini" onClick={() => props.onSave(draft)}>
          Save
        </Button>
      </div>
      <div className="min-h-0 grow">
        <CodeEditor
          language="json"
          value={props.value}
          path={filePath}
          onChange={(draft) => setDraft(draft)}
          onMount={function handleEditorDidMount(editor, monaco) {
            setMonacomonacoInstance(monaco);
            // cmd+S binding to save
            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () =>
              props.onSave(editor.getValue()),
            );

            // Handle JSON5 paste conversion
            editor.onDidPaste(async () => {
              const model = editor.getModel();
              if (!model) return;

              // Wait 20 ms for paste to complete
              setTimeout(async () => {
                const fullContent = model.getValue();
                if (!fullContent.trim()) return;

                const converted = parsePermsJSON(fullContent);
                if (converted.status === 'ok') {
                  model.setValue(JSON.stringify(converted.value, null, 2));
                }
              }, 20);
            });
          }}
        />
      </div>
    </div>
  );
}

export type FenceLanguage =
  | 'jsx'
  | 'tsx'
  | 'javascript'
  | 'typescript'
  | 'bash'
  | 'json'
  | 'sql';

export function Fence({
  code,
  language,
  style: _style,
  className: _className,
  copyable,
}: {
  code: string;
  language: FenceLanguage;
  className?: string;
  style?: any;
  copyable?: boolean;
}) {
  const { darkMode } = useDarkMode();
  const [copyLabel, setCopyLabel] = useState('Copy');
  return (
    <Highlight
      {...defaultProps}
      code={code.trimEnd()}
      language={language}
      theme={
        darkMode
          ? {
              plain: {
                backgroundColor: '#262626',
                color: 'white',
              },
              styles: [],
            }
          : rosePineDawnTheme
      }
    >
      {({ className, style, tokens, getTokenProps }) => (
        <pre
          className={clsx(className, _className)}
          style={{
            ...style,
            ..._style,
            ...(copyable ? { position: 'relative' } : {}),
          }}
        >
          {copyable ? (
            <div className="absolute top-0 right-0 flex items-center px-2">
              <button
                onClick={(e) => {
                  copy(code);
                  setCopyLabel('Copied!');
                  setTimeout(() => {
                    setCopyLabel('Copy');
                  }, 2500);
                  e.preventDefault();
                  e.stopPropagation();
                }}
                className="flex items-center gap-x-1 rounded-sm bg-white px-2 py-1 text-xs ring-1 ring-gray-300 ring-inset hover:bg-gray-50 dark:bg-neutral-800 dark:ring-neutral-700"
              >
                <ClipboardDocumentIcon
                  className="-ml-0.5 h-4 w-4"
                  aria-hidden="true"
                />
                {copyLabel}
              </button>
            </div>
          ) : null}
          <code>
            {tokens.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {line
                  .filter((token) => !token.empty)
                  .map((token, tokenIndex) => {
                    const { key, ...props } = getTokenProps({ token });
                    return <span key={key || tokenIndex} {...props} />;
                  })}
                {'\n'}
              </Fragment>
            ))}
          </code>
        </pre>
      )}
    </Highlight>
  );
}

import useMonacoJSONSchema from '@/lib/hooks/useMonacoJsonSchema';
import { parsePermsJSON } from '@/lib/parsePermsJSON';
import { useId } from 'react';
import { useDarkMode } from './dash/DarkModeToggle';
