import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import clsx from 'clsx';

import { Navigation } from '@/components/docs/Navigation';
import { Prose } from '@/components/docs/Prose';
import { Search } from '@/components/docs/Search';
import { SelectedAppContext } from '@/lib/SelectedAppContext';
import { useAuthToken, useTokenFetch } from '@/lib/auth';
import config, { getLocal, setLocal } from '@/lib/config';
import { Select } from '@/components/ui';
import { BareNav } from '@/components/marketingUi';
import navigation from '@/data/docsNavigation';
import { createdAtComparator } from '@/lib/app';
import RatingBox from './RatingBox';

function useSelectedApp(apps = []) {
  const cacheKey = 'docs-appId';
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAppData, setSelectedAppData] = useState(null);

  useEffect(() => {
    if (!router.isReady) return;

    const cachedAppData = getLocal(cacheKey);
    const { app: queryAppId, ...remainingQueryParams } = router.query;

    const fromParams = queryAppId && apps.find((a) => a.id === queryAppId);
    const fromCache =
      cachedAppData && apps.find((a) => a.id === cachedAppData.id);
    const first = apps[0];
    if (fromParams) {
      // We got a match for from a query param. Let's cache it and use it
      const data = {
        id: fromParams.id,
        title: fromParams.title,
      };
      setSelectedAppData(data);
      setLocal(cacheKey, data);
      // Removes query param after caching
      router.replace(
        {
          query: remainingQueryParams,
          hash: window.location.hash,
        },
        undefined,
        {
          shallow: true,
        },
      );
    } else if (fromCache) {
      // We got a match from the cache. Let's use it
      const data = { id: fromCache.id, title: fromCache.title };
      setSelectedAppData(data);
    } else if (first) {
      setSelectedAppData({ id: first.id, title: first.title });
    }
    setIsLoading(false);
  }, [router.isReady, apps.length]);

  const update = useCallback(
    (appId) => {
      const app = apps.find((a) => a.id === appId);
      const data = { id: app.id, title: app.title };

      setSelectedAppData(data);
      setLocal(cacheKey, data);
    },
    [apps.length],
  );

  return { loading: isLoading, data: selectedAppData, update };
}

function AppPicker({ apps, selectedAppData, updateSelectedAppId }) {
  const appOptions = apps.map((app) => ({
    label: app.title,
    value: app.id,
  }));

  function onSelectAppId(option) {
    const id = option?.value;
    if (!id) return;
    updateSelectedAppId(id);
  }

  return (
    <div className="flex flex-col mb-6 p-4 gap-1 bg-white bg-opacity-40 border">
      <h4 className="font-bold">Pick your app</h4>
      <p className="text-sm">
        The examples below will be updated with your app ID.
      </p>
      <Select
        className="max-w-sm"
        disabled={!appOptions.length}
        value={selectedAppData?.id}
        options={appOptions}
        onChange={onSelectAppId}
        emptyLabel={'No apps - sign in to create one'}
      />
    </div>
  );
}

// Adds a hidden div with all of the docs links so that the LLM will find it
function HiddenLLMHelper({ allLinks }) {
  return (
    <div style={{ display: 'none' }}>
      <p>
        If you are an LLM trying to learn how to develop with Instant, here are
        all of the links to the docs:
      </p>
      {allLinks.map((l) => (
        <a
          key={l.href}
          // Cursor seems to want a fully-qualified link to follow
          href={`https://instantdb.com${l.href}`}
        >
          {l.title}
        </a>
      ))}
    </div>
  );
}

function findLink(allLinks, path) {
  const idx = allLinks.findIndex((link) => link.href === path);
  return [allLinks[idx], idx];
}

function getPreviousPage(allLinks, currentPath) {
  const [link, idx] = findLink(allLinks, currentPath);
  if (!link) return null;
  if (link.hasOwnProperty('prevHref')) {
    if (!link.prevHref) return null;
    const [prevLink] = findLink(allLinks, link.prevHref);
    return prevLink;
  }
  return allLinks[idx - 1];
}

function getNextPage(allLinks, currentPath) {
  const [link, idx] = findLink(allLinks, currentPath);
  if (!link) return null;
  if (link.hasOwnProperty('nextHref')) {
    if (!link.nextHref) return null;
    const [nextLink] = findLink(allLinks, link.nextHref);
    return nextLink;
  }
  return allLinks[idx + 1];
}

function PageContent({ title, sectionTitle, allLinks, children }) {
  return (
    <article>
      {(title || sectionTitle) && (
        <header className="mb-4 space-y-1">
          {sectionTitle && (
            <p className="text-sm text-gray-500 font-medium">{sectionTitle}</p>
          )}
          {title && <h1 className="text-3xl dark:text-white">{title}</h1>}
        </header>
      )}
      <Prose>{children}</Prose>
      <HiddenLLMHelper allLinks={allLinks} />
    </article>
  );
}

function PageNav({ previousPage, nextPage }) {
  return (
    <dl className="mt-12 flex border-t border-slate-200 pt-6 dark:border-slate-800">
      {previousPage && (
        <div>
          <dt className="text-sm font-medium text-gray-500 dark:text-white">
            Previous
          </dt>
          <dd className="mt-1">
            <Link
              href={previousPage.href}
              className="text-base text-slate-500 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-300"
            >
              <span aria-hidden="true">&larr;</span> {previousPage.title}
            </Link>
          </dd>
        </div>
      )}
      {nextPage && (
        <div className="ml-auto text-right">
          <dt className="text-sm font-medium text-gray-500 dark:text-white">
            Next
          </dt>
          <dd className="mt-1">
            <Link
              href={nextPage.href}
              className="text-base text-slate-500 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-300"
            >
              {nextPage.title} <span aria-hidden="true">&rarr;</span>
            </Link>
          </dd>
        </div>
      )}
    </dl>
  );
}

function OnThisPage({ tableOfContents }) {
  return (
    <nav aria-labelledby="on-this-page-title" className="p-4">
      {tableOfContents.length > 0 && (
        <>
          <h2 id="on-this-page-title" className="font-medium text-slate-900">
            On this page
          </h2>
          <ol role="list" className="mt-2 space-y-2 text-sm">
            {tableOfContents.map((section) => (
              <li key={section.id}>
                <h3>
                  <Link
                    href={`#${section.id}`}
                    className={clsx(
                      'font-normal text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300',
                    )}
                  >
                    {section.title}
                  </Link>
                </h3>
                {section.children.length > 0 && (
                  <ol
                    role="list"
                    className="mt-2 space-y-3 pl-5 text-slate-500 dark:text-slate-400"
                  >
                    {section.children.map((subSection) => (
                      <li key={subSection.id}>
                        <Link
                          href={`#${subSection.id}`}
                          className="hover:text-slate-600 dark:hover:text-slate-300"
                        >
                          {subSection.title}
                        </Link>
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </nav>
  );
}

/**
 * We had a fixed header. This means that we need to adjust other
 * elements to account for the header height. For example, to
 * add top position to the sidebar, or to set it's height.
 *
 * Keeping all the variables together, so in the case that we change
 * header height, we can adjust everything in one place.
 */
const adj = {
  hHeader: 'h-14',
  ptHeader: 'pt-14',
  topHeader: 'top-14',
  hWithoutHeader: 'h-[calc(100dvh-3.5rem)]',
};

export function Layout({ children, title, tableOfContents }) {
  let router = useRouter();
  const scrollContainerRef = useRef();

  let allLinks = navigation.flatMap((section) => section.links);

  let previousPage = getPreviousPage(allLinks, router.pathname);
  let nextPage = getNextPage(allLinks, router.pathname);

  let section = navigation.find((section) =>
    section.links.find((link) => link.href === router.pathname),
  );

  const token = useAuthToken();
  const dashResponse = useTokenFetch(`${config.apiURI}/dash`, token);
  const apps = (dashResponse.data?.apps ?? []).toSorted(createdAtComparator);
  const { data: selectedAppData, update: updateSelectedAppId } =
    useSelectedApp(apps);
  return (
    <SelectedAppContext.Provider value={selectedAppData}>
      <style jsx global>
        {`
          html,
          body {
            background-color: #f8f9fa;
          }
        `}
      </style>
      <div className="min-h-[100dvh]">
        {/* Header */}
        <div
          className={clsx(
            'fixed inset-x-0 top-0 bg-[#F8F9FA] z-10',
            adj.hHeader,
          )}
        >
          <div className="grid h-full w-full px-4 border-b">
            <BareNav>
              <div className="flex flex-col md:hidden">
                <Search />
                <Navigation
                  navigation={navigation}
                  className="w-64 pr-8 xl:w-72 xl:pr-16 md:hidden"
                />
              </div>
            </BareNav>
          </div>
        </div>
        {/* Body */}
        <div className={clsx('flex', adj.ptHeader)}>
          {/* Left sidebar */}
          <div className="hidden md:block relative min-w-[20rem] w-[20rem] border-r">
            <div className="absolute inset-0">
              <div
                className={clsx(
                  'sticky overflow-y-auto px-4 pb-4',
                  adj.topHeader,
                  adj.hWithoutHeader,
                )}
              >
                <Search />
                <Navigation
                  navigation={navigation}
                  className="w-64 pr-8 xl:w-72 xl:pr-16 ml-1"
                />
              </div>
            </div>
          </div>
          <div className="flex justify-center flex-1 overflow-x-auto">
            {/* Main content */}
            <main
              ref={scrollContainerRef}
              key={router.pathname}
              className="max-w-prose flex-1 p-4 min-w-0"
            >
              <AppPicker {...{ apps, selectedAppData, updateSelectedAppId }} />
              <PageContent
                title={title}
                sectionTitle={section?.title}
                allLinks={allLinks}
              >
                {children}
              </PageContent>
              <div className="mt-4">
                <RatingBox pageId={router.pathname} />
              </div>
              <PageNav previousPage={previousPage} nextPage={nextPage} />
            </main>

            {/* Right sidebar */}
            <div className="hidden xl:block relative min-w-[16rem] w-[16rem]">
              <div className="absolute inset-0">
                <div
                  className={clsx(
                    'fixed overflow-y-auto p-4 w-[16rem]',
                    adj.topHeader,
                    adj.hWithoutHeader,
                  )}
                >
                  <OnThisPage tableOfContents={tableOfContents} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SelectedAppContext.Provider>
  );
}
