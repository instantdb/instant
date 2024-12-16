/* Components for navigating between doc pages and conditionally rendering content
  *
  * Usage: Navigate to different page
  * {% nav-button title="Title" description="Description" href="/docs/slug" /%}
  *
  * Usage: Conditionally render content
  * {% nav-group %}
  *   {% nav-button title="Foo" description="I am Foo" param="choice"
  *      value="foo" /%}
  *   {% nav-button title="Bar" description="I am Bar" param="choice"
  *      value="bar" /%}
  * {% /nav-group %}
  *
  * {% conditional param="choice" value="foo" %}
  *   Content for Foo
  * {% /conditional %}
  *
  * {% conditional param="choice" value="bar" %}
  *   Content for Bar
  * {% /conditional %}
  */
import Link from 'next/link';
import { useRouter } from 'next/router';
import { createContext, useContext } from 'react';

const DefaultValueContext = createContext(undefined);

export function NavDefault({ value, children }) {
  return (
    <DefaultValueContext.Provider value={value}>
      {children}
    </DefaultValueContext.Provider>
  );
}

export function NavGroup({ children }) {
  return (
    <div className="not-prose my-12 grid grid-cols-2 gap-3 xl:grid-cols-3">
      {children}
    </div>
  );
}

function isSelected(param, value) {
  const router = useRouter();
  const query = router.query;
  const defaultValue = useContext(DefaultValueContext);
  return value && (value === (router.query[param] || defaultValue));
}

export function NavButton({ title, description, param, value, href}) {
  const router = useRouter();
  const selected = isSelected(param, value);

  const handleClick = () => {
    router.replace({
      pathname: router.pathname,
      query: { ...router.query, [param]: value },
    }, undefined, { scroll: false });
  };
  const Component = (
    <div className="group h-full flex flex-col relative rounded-xl border border-slate-200 dark:border-slate-800 max-w-sm hover:cursor-pointer "
      onClick={() => !href && handleClick()}
    >
      <div className={"absolute -inset-px rounded-xl border-2 border-transparent opacity-0 [background:linear-gradient(var(--quick-links-hover-bg,theme(colors.sky.50)),var(--quick-links-hover-bg,theme(colors.sky.50)))_padding-box,linear-gradient(to_top,theme(colors.indigo.400),theme(colors.cyan.400),theme(colors.sky.500))_border-box] group-hover:opacity-100 dark:[--quick-links-hover-bg:theme(colors.slate.800)]" + (selected ? " opacity-100" : "")} />
      <div className="relative overflow-hidden rounded-xl p-6">
        <h2 className="font-semibold text-slate-900 dark:text-white">
          {title}
        </h2>
        <p className="mt-1 text-sm text-slate-700 dark:text-slate-400">
          {description}
        </p>
      </div>
    </div>
  )

  return (
    <div>
      {href ? (
        <Link href={href}>
          {Component}
        </Link>
      ) : (Component)}
    </div>
  );
}

export function ConditionalContent({ param, value, children }) {
  const selected = isSelected(param, value);

  if (selected) {
    return <>{children}</>;
  }

  return null;
}
