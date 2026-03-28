import clsx from 'clsx';

export function Prose({ as: Component = 'div', className, ...props }) {
  return (
    <Component
      className={clsx(
        className,
        'prose max-w-none leading-relaxed',
        // headings
        'prose-headings:scroll-mt-28 prose-headings:font-normal prose-headings:leading-snug lg:prose-headings:scroll-mt-34',
        'prose-h1:mb-4 prose-h1:mt-12 prose-h2:mb-3 prose-h2:mt-8 prose-h3:mb-3 prose-h3:mt-6',
        // lead
        'prose-lead:text-slate-500 dark:prose-lead:text-slate-400',
        // links
        'prose-a:font-normal prose-a:text-orange-600 dark:prose-a:text-orange-400',
        // hr
        'prose-hr:mb-4 prose-hr:mt-4 dark:prose-hr:border-slate-800',
        // code
        'prose-code:bg-white prose-code:bg-opacity-50 prose-code:p-0.5 prose-code:before:content-none prose-code:after:content-none',
      )}
      {...props}
    />
  );
}
