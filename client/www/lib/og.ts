export function url({ title, section }: { title?: string; section?: string }) {
  return `/api/og?title=${encodeURIComponent(title || '')}&section=${section || ''}`;
}
