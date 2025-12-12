import { CheckIcon } from '@heroicons/react/24/outline';
import { cn } from '@instantdb/components';
import { useState } from 'react';

const transformContentToId = (content) => {
  return content
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // remove special characters
    .replace(/\s+/g, '-') // replace whitespace with hyphens
    .replace(/-+/g, '-') // collapse multiple hyphens
    .replace(/^-|-$/g, '') // trim leading/trailing hyphens
    .slice(0, 50); // keep it short
};

export function Heading({ level = 1, id, children, ...props }) {
  const Tag = `h${level}`;

  const [hasCopied, setHasCopied] = useState(false);

  function handleHeaderClick(event) {
    const header = event.currentTarget;
    const id = header.getAttribute('id');

    if (id) {
      // Update the URL hash without triggering a page reload
      const newUrl = `${window.location.pathname}#${id}`;
      window.history.pushState(null, '', newUrl);

      // Scroll to the header
      header.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // copy the url to the clipboard
    navigator.clipboard.writeText(window.location.href);
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), 1000);
  }

  // Use the id from collectHeadings if provided, otherwise generate one
  const slugId =
    id ||
    (typeof children === 'string' ? transformContentToId(children) : undefined);

  return (
    <Tag
      id={slugId}
      onClick={handleHeaderClick}
      className="group cursor-pointer"
      {...props}
    >
      <span
        className={cn(
          'absolute -ml-6 grid h-[2rem] place-items-center text-center text-gray-400 opacity-0 transition-opacity group-hover:opacity-100',
        )}
      >
        {hasCopied ? <CheckIcon width={18} strokeWidth={3} /> : '#'}
      </span>
      {children}
    </Tag>
  );
}
