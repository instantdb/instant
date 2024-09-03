import { useCallback, useEffect, useState } from 'react';
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
import { MainNav } from '@/components/marketingUi';
import navigation from '@/data/docsNavigation';

function useTableOfContents(tableOfContents) {
  let [currentSection, setCurrentSection] = useState(tableOfContents[0]?.id);

  let getHeadings = useCallback((tableOfContents) => {
    return tableOfContents
      .flatMap((node) => [node.id, ...node.children.map((child) => child.id)])
      .map((id) => {
        let el = document.getElementById(id);
        if (!el) return;

        let style = window.getComputedStyle(el);
        let scrollMt = parseFloat(style.scrollMarginTop);

        let top = window.scrollY + el.getBoundingClientRect().top - scrollMt;
        return { id, top };
      });
  }, []);

  useEffect(() => {
    if (tableOfContents.length === 0) return;
    let headings = getHeadings(tableOfContents);
    function onScroll() {
      let top = window.scrollY;
      let current = headings[0].id;
      for (let heading of headings) {
        if (top >= heading.top) {
          current = heading.id;
        } else {
          break;
        }
      }
      setCurrentSection(current);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll, { passive: true });
    };
  }, [getHeadings, tableOfContents]);

  return currentSection;
}

function useSelectedApp(apps = []) {
  const cacheKey = 'docs-appId';
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAppData, setSelectedAppData] = useState(null);

  useEffect(() => {
    if (!router.isReady) return;

    const cachedAppData = getLocal(cacheKey);
    const { app: queryAppId, ...remainingQueryParams } = router.query;
    const match = apps.find((a) => a.id === queryAppId);
    const first = apps[0];

    // If query param matches valid app, use that one and cache it in localStorage.
    // Next, if an app is already cached, use that. Otherwise, default to the first app.
    if (match) {
      const data = { id: match.id, title: match.title };
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
        }
      );
    } else if (cachedAppData) {
      setSelectedAppData(cachedAppData);
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
    [apps.length]
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
    <div className="flex flex-col mb-6 p-4 gap-1 bg-white border rounded">
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

export function Layout({ children, title, tableOfContents }) {
  let router = useRouter();
  let allLinks = navigation.flatMap((section) => section.links);
  let linkIndex = allLinks.findIndex((link) => link.href === router.pathname);
  let previousPage = allLinks[linkIndex - 1];
  let nextPage = allLinks[linkIndex + 1];
  let section = navigation.find((section) =>
    section.links.find((link) => link.href === router.pathname)
  );
  let currentSection = useTableOfContents(tableOfContents);

  function isActive(section) {
    if (section.id === currentSection) {
      return true;
    }
    if (!section.children) {
      return false;
    }
    return section.children.findIndex(isActive) > -1;
  }

  const token = useAuthToken();
  const dashResponse = useTokenFetch(`${config.apiURI}/dash`, token);
  const apps = dashResponse.data?.apps ?? [];
  const { data: selectedAppData, update: updateSelectedAppId } =
    useSelectedApp(apps);

  return (
    <div className="bg-[#F8F9FA] flex flex-col overflow-hidden h-full w-full">
      <SelectedAppContext.Provider value={selectedAppData}>
        <div className="bg-[#F8F9FA] border-b">
          <MainNav>
            <div className="flex flex-col md:hidden">
              <Search />
              <Navigation
                navigation={navigation}
                className="w-64 pr-8 xl:w-72 xl:pr-16 md:hidden"
              />
            </div>
          </MainNav>
        </div>
        <div className="xl:mx-auto flex flex-1 overflow-hidden h-full max-w-7xl justify-center">
          <div className="hidden md:block md:flex-none overflow-auto pl-8 pr-2 pb-8">
            <Search />
            <div>
              <Navigation
                navigation={navigation}
                className="w-64 pr-8 xl:w-72 xl:pr-16 ml-1"
              />
            </div>
          </div>
          <div className="overflow-auto px-4 pb-6 pt-4">
            <AppPicker {...{ apps, selectedAppData, updateSelectedAppId }} />
            <article>
              {(title || section) && (
                <header className="mb-6 space-y-1">
                  {section && (
                    <p className="text-sm font-medium text-sky-500">
                      {section.title}
                    </p>
                  )}
                  {title && (
                    <h1 className="text-3xl tracking-tight text-slate-900 dark:text-white">
                      {title}
                    </h1>
                  )}
                </header>
              )}
              <Prose>{children}</Prose>
            </article>
            <dl className="mt-12 flex border-t border-slate-200 pt-6 dark:border-slate-800">
              {previousPage && (
                <div>
                  <dt className="text-sm font-medium text-slate-900 dark:text-white">
                    Previous
                  </dt>
                  <dd className="mt-1">
                    <Link href={previousPage.href}>
                      <a className="text-base font-semibold text-slate-500 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-300">
                        <span aria-hidden="true">&larr;</span>{' '}
                        {previousPage.title}
                      </a>
                    </Link>
                  </dd>
                </div>
              )}
              {nextPage && (
                <div className="ml-auto text-right">
                  <dt className="text-sm font-medium text-slate-900 dark:text-white">
                    Next
                  </dt>
                  <dd className="mt-1">
                    <Link href={nextPage.href}>
                      <a className="text-base font-semibold text-slate-500 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-300">
                        {nextPage.title} <span aria-hidden="true">&rarr;</span>
                      </a>
                    </Link>
                  </dd>
                </div>
              )}
            </dl>
          </div>
          <div className="hidden xl:block px-4 py-4 overflow-y-auto xl:basis-96">
            <nav aria-labelledby="on-this-page-title">
              {tableOfContents.length > 0 && (
                <>
                  <h2
                    id="on-this-page-title"
                    className="font-medium text-slate-900"
                  >
                    On this page
                  </h2>
                  <ol role="list" className="mt-2 space-y-2 text-sm">
                    {tableOfContents.map((section) => (
                      <li key={section.id}>
                        <h3>
                          <Link href={`#${section.id}`}>
                            <a
                              className={clsx(
                                isActive(section)
                                  ? 'text-sky-500'
                                  : 'font-normal text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
                              )}
                            >
                              {section.title}
                            </a>
                          </Link>
                        </h3>
                        {section.children.length > 0 && (
                          <ol
                            role="list"
                            className="mt-2 space-y-3 pl-5 text-slate-500 dark:text-slate-400"
                          >
                            {section.children.map((subSection) => (
                              <li key={subSection.id}>
                                <Link href={`#${subSection.id}`}>
                                  <a
                                    className={
                                      isActive(subSection)
                                        ? 'text-sky-500'
                                        : 'hover:text-slate-600 dark:hover:text-slate-300'
                                    }
                                  >
                                    {subSection.title}
                                  </a>
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
          </div>
        </div>
      </SelectedAppContext.Provider>
    </div>
  );
}
