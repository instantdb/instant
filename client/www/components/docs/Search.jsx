import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/router';
import { DocSearchModal, useDocSearchKeyboardEvents } from '@docsearch/react';
import '@docsearch/css';

const docSearchConfig = {
  appId: "98PPX6H1AS",
  apiKey: "ee52f4bc250c519ea97596da07560d82", // search only API key
  indexName: "docs",
};

function SearchIcon(props) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" {...props}>
      <path d="M16.293 17.707a1 1 0 0 0 1.414-1.414l-1.414 1.414ZM9 14a5 5 0 0 1-5-5H2a7 7 0 0 0 7 7v-2ZM4 9a5 5 0 0 1 5-5V2a7 7 0 0 0-7 7h2Zm5-5a5 5 0 0 1 5 5h2a7 7 0 0 0-7-7v2Zm8.707 12.293-3.757-3.757-1.414 1.414 3.757 3.757 1.414-1.414ZM14 9a4.98 4.98 0 0 1-1.464 3.536l1.414 1.414A6.98 6.98 0 0 0 16 9h-2Zm-1.464 3.536A4.98 4.98 0 0 1 9 14v2a6.98 6.98 0 0 0 4.95-2.05l-1.414-1.414Z" />
    </svg>
  );
}

export function Search() {
  const [isOpen, setIsOpen] = useState(false);
  const [modifierKey, setModifierKey] = useState(null);
  const [initialQuery, setInitialQuery] = useState(null);
  const router = useRouter();

  const onOpen = useCallback(() => {
    setIsOpen(true);
  }, [setIsOpen]);

  const onClose = useCallback(() => {
    setIsOpen(false);
  }, [setIsOpen]);

  useDocSearchKeyboardEvents({
    isOpen,
    onOpen,
    onClose,
  });

  useEffect(() => {
    setModifierKey(
      /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform) ? '⌘' : 'Ctrl '
    );
  }, []);

  // Enable search on load if `q` is in the query string
  const query = router.query;
  useEffect(() => {
    if (query?.q) {
      setInitialQuery(query.q);
      onOpen();
    }
  }, [query.q]);

  return (
    <>
      <button
        type="button"
        className="group flex h-auto w-80 flex-none py-2.5 my-4 pl-4 pr-3.5 text-sm ring-1 ring-slate-200 hover:ring-slate-300"
        onClick={onOpen}
      >
        <SearchIcon className="h-5 w-5 flex-none fill-slate-400 group-hover:fill-slate-500 dark:fill-slate-500 md:group-hover:fill-slate-400" />
        <span className="text-md md:hidden">Search Docs</span>
        <span className="sr-only md:not-sr-only md:ml-2 md:text-slate-500 md:dark:text-slate-400">
          Search docs
        </span>
        {modifierKey && (
          <kbd className="ml-auto hidden font-medium text-slate-400 dark:text-slate-500 md:block">
            <kbd className="font-sans">{modifierKey}</kbd>
            <kbd className="font-sans">K</kbd>
          </kbd>
        )}
      </button>
      {isOpen &&
        createPortal(
          <DocSearchModal
            placeholder="Search docs..."
            {...docSearchConfig}
            initialScrollY={window.scrollY}
            onClose={onClose}
            initialQuery={initialQuery}
            navigator={{
              navigate({ itemUrl }) {
                router.push(itemUrl);
              },
            }}
          />,
          document.body
        )}
    </>
  );
}
