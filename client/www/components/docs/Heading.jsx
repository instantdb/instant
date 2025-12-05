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

export function Heading({ level = 1, id, children, ...props }) {
  const Tag = `h${level}`;
  
  return (
    <Tag
      id={id}
      onClick={handleHeaderClick}
      style={{ cursor: id ? 'pointer' : 'default' }}
      {...props}
    >
      {children}
    </Tag>
  );
}
