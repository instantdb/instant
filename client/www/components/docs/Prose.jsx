import clsx from 'clsx';

export function Prose({ as: Component = 'div', className, ...props }) {
  return (
    <Component
      className={clsx(
        className,
        'prose max-w-none',
        // headings
        'prose-headings:scroll-mt-28 prose-headings:font-normal lg:prose-headings:scroll-mt-34',
        'prose-h1:mb-4 prose-h1:mt-8 prose-h2:mb-4 prose-h2:mt-4 prose-h3:mb-4 prose-h3:mt-4',
        // lead
        'prose-lead:text-slate-500 dark:prose-lead:text-slate-400',
        // links
        'prose-a:font-normal prose-a:text-blue-500 dark:prose-a:text-sky-400',
        // hr
        'prose-hr:mb-4 prose-hr:mt-4 dark:prose-hr:border-slate-800',
        // code
        'prose-code:bg-white prose-code:bg-opacity-50 prose-code:p-0.5 prose-code:before:content-none prose-code:after:content-none',
      )}
      {...props}
    />
  );
}
