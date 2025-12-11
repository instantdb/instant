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
}

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
      <span className="absolute -ml-6 hidden text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 lg:inline">
        #
      </span>
      {children}
    </Tag>
  );
}
