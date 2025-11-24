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

  const slugId =
    typeof children === 'string' ? transformContentToId(children) : id;

  return (
    <div className="group flex w-fit -translate-x-5 cursor-pointer items-center gap-2 p-0 pr-4">
      <div className="text-xl opacity-0 transition-opacity group-hover:opacity-70">
        #
      </div>
      <Tag
        id={slugId}
        onClick={handleHeaderClick}
        style={{ cursor: slugId ? 'pointer' : 'default' }}
        {...props}
      >
        {children}
      </Tag>
    </div>
  );
}
