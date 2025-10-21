import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import clsx from 'clsx';

import { Navigation } from '@/components/docs/Navigation';
import { Prose } from '@/components/docs/Prose';
import { Search } from '@/components/docs/Search';
import { SelectedAppContext } from '@/lib/SelectedAppContext';
import { useAuthToken, useTokenFetch } from '@/lib/auth';
import config from '@/lib/config';
import { Select, Button } from '@/components/ui';
import { BareNav } from '@/components/marketingUi';
import navigation from '@/data/docsNavigation';
import { createdAtComparator, titleComparator } from '@/lib/app';
import RatingBox from './RatingBox';
import { useIsHydrated } from '@/lib/hooks/useIsHydrated';
import { getLocallySavedApp, setLocallySavedApp } from '@/lib/locallySavedApp';

function useWorkspaceData(workspaceId, token) {
  const dashResponse = useTokenFetch(`${config.apiURI}/dash`, token);

  const orgEndpoint =
    workspaceId !== 'personal'
      ? `${config.apiURI}/dash/orgs/${workspaceId}`
      : null;
  const orgResponse = useTokenFetch(orgEndpoint, token);

  const apps =
    workspaceId === 'personal'
      ? (dashResponse.data?.apps ?? [])
      : (orgResponse.data?.apps ?? []);

  // If there's no token, we're not loading - we just don't have data
  if (!token) {
    return {
      apps: [],
      orgs: [],
      isLoading: false,
    };
  }

  return {
    apps,
    orgs: dashResponse.data?.orgs || [],
    isLoading:
      !dashResponse.data || (workspaceId !== 'personal' && !orgResponse.data),
  };
}

function useSelectedApp(apps = [], orgId) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAppData, setSelectedAppData] = useState(null);

  useEffect(() => {
    if (!router.isReady) return;

    const cachedAppData = getLocallySavedApp(orgId);
    const { app: queryAppId, ...remainingQueryParams } = router.query;

    const fromParams = queryAppId && apps.find((a) => a.id === queryAppId);
    const fromCache =
      cachedAppData && apps.find((a) => a.id === cachedAppData.id);
    const first = apps[0];

    if (fromParams) {
      const data = {
        id: fromParams.id,
        title: fromParams.title,
      };
      setSelectedAppData(data);
      setLocallySavedApp({
        id: fromParams.id,
        orgId: orgId,
      });
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
      const data = { id: fromCache.id, title: fromCache.title };
      setSelectedAppData(data);
    } else if (first) {
      setSelectedAppData({ id: first.id, title: first.title });
    }
    setIsLoading(false);
  }, [router.isReady, apps.length, orgId]);

  const update = useCallback(
    (appId) => {
      const app = apps.find((a) => a.id === appId);
      const data = { id: app.id, title: app.title };

      setSelectedAppData(data);
      setLocallySavedApp({
        id: app.id,
        orgId: orgId,
      });
    },
    [apps.length, orgId],
  );

  return { loading: isLoading, data: selectedAppData, update };
}

const contentCache = {};

function CopyAsMarkdown({ path, label = 'Copy as markdown' }) {
  const [copyLabel, setCopyLabel] = useState(label);
  const fetchingRef = useRef(false);
  const url = `${path}.md`;

  // Prefetch content when component mounts
  // Fixes bug in Safari where clipboard API would fail on first use
  useEffect(() => {
    if (!contentCache[path]) {
      fetch(url)
        .then((response) => response.text())
        .then((content) => {
          contentCache[path] = content;
        })
        .catch((err) => console.error('Failed to prefetch markdown:', err));
    }
  }, [path, url]);

  const handleCopy = async () => {
    if (fetchingRef.current) return;
    try {
      fetchingRef.current = true;

      // Use cached content if available
      let content = contentCache[path];

      if (!content) {
        const response = await fetch(url);
        content = await response.text();
        contentCache[path] = content;
      }

      await navigator.clipboard.writeText(content);
      setCopyLabel('Copied!');
      setTimeout(() => {
        setCopyLabel(label);
      }, 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
      setCopyLabel('Failed');
      setTimeout(() => {
        setCopyLabel(label);
      }, 2000);
    } finally {
      fetchingRef.current = false;
    }
  };

  return (
    <Button
      size="nano"
      variant="secondary"
      className="py-2"
      onClick={handleCopy}
    >
      {copyLabel}
    </Button>
  );
}

function AppPicker({
  apps,
  selectedAppData,
  updateSelectedAppId,
  workspaceId,
  allOrgs,
}) {
  const router = useRouter();

  const appOptions = apps.toSorted(titleComparator).map((app) => ({
    label: app.title,
    value: app.id,
  }));

  const workspaceOptions = [];

  if (workspaceId !== 'personal') {
    workspaceOptions.push({
      label: 'Personal',
      value: 'org:personal',
    });
  }

  allOrgs.forEach((org) => {
    if (org.id !== workspaceId) {
      workspaceOptions.push({
        label: org.title,
        value: `org:${org.id}`,
      });
    }
  });

  const orgOptions =
    workspaceOptions.length > 0
      ? [
          { label: '── Switch workspace ──', value: null, disabled: true },
          ...workspaceOptions,
        ]
      : [];

  const allOptions = [...appOptions, ...orgOptions];

  function onSelectAppId(option) {
    const value = option?.value;
    if (!value) return;

    if (value.startsWith('org:')) {
      const orgId = value.substring(4);
      if (orgId === 'personal') {
        router.push('/docs');
      } else {
        router.push(`/docs?org=${orgId}`);
      }
    } else {
      updateSelectedAppId(value);
    }
  }

  const currentWorkspaceName =
    workspaceId === 'personal'
      ? 'Personal'
      : allOrgs.find((org) => org.id === workspaceId)?.title || workspaceId;

  return (
    <div className="mb-6 flex flex-col gap-1 border bg-white bg-opacity-40 p-4">
      <h4 className="font-bold">Pick your app</h4>
      <p className="text-sm">
        The examples below will be updated with your app ID.
      </p>
      {allOrgs.length > 0 && (
        <p className="text-xs text-gray-600 mt-1">
          Current workspace: <strong>{currentWorkspaceName}</strong>
        </p>
      )}
      <Select
        className="max-w-sm"
        disabled={!allOptions.length}
        value={selectedAppData?.id}
        options={allOptions}
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

function PageContent({ path, title, sectionTitle, allLinks, children }) {
  return (
    <article>
      {(title || sectionTitle) && (
        <header className="mb-4 space-y-1">
          {sectionTitle && (
            <p className="text-sm font-medium text-gray-500">{sectionTitle}</p>
          )}
          {title && (
            <div className="space-y-4 md:space-y-0 md:grid md:grid-cols-[1fr_auto] md:items-start">
              <h1 className="text-3xl dark:text-white">{title}</h1>
              <CopyAsMarkdown path={path} />
            </div>
          )}
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

  const workspaceId = router.query.org || 'personal';
  const token = useAuthToken();
  const {
    apps,
    orgs,
    isLoading: isLoadingWorkspace,
  } = useWorkspaceData(workspaceId, token);

  const { data: selectedAppData, update: updateSelectedAppId } = useSelectedApp(
    apps,
    workspaceId,
  );
  const isHydrated = useIsHydrated();
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
            'fixed inset-x-0 top-0 z-10 bg-[#F8F9FA]',
            adj.hHeader,
          )}
        >
          <div className="grid h-full w-full border-b px-4">
            <BareNav>
              <div className="flex flex-col md:hidden">
                <Search />
                <Navigation
                  navigation={navigation}
                  className="w-64 pr-8 md:hidden xl:w-72 xl:pr-16"
                />
              </div>
            </BareNav>
          </div>
        </div>
        {/* Body */}
        <div className={clsx('flex', adj.ptHeader)}>
          {/* Left sidebar */}
          <div className="relative hidden w-[20rem] min-w-[20rem] border-r md:block">
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
                  className="ml-1 w-64 pr-8 xl:w-72 xl:pr-16"
                />
              </div>
            </div>
          </div>
          <div className="flex flex-1 justify-center overflow-x-auto">
            {/* Main content */}
            <main
              ref={scrollContainerRef}
              key={router.pathname}
              className="min-w-0 max-w-prose flex-1 p-4"
            >
              {isHydrated && !isLoadingWorkspace && (
                <AppPicker
                  {...{
                    apps,
                    selectedAppData,
                    updateSelectedAppId,
                    workspaceId,
                    allOrgs: orgs,
                  }}
                />
              )}
              <PageContent
                path={router.pathname}
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
            <div className="relative hidden w-[16rem] min-w-[16rem] xl:block">
              <div className="absolute inset-0">
                <div
                  className={clsx(
                    'fixed w-[16rem] overflow-y-auto p-4',
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
