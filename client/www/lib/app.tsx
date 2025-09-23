export function createdAtComparator(
  a: { created_at: string },
  b: { created_at: string },
) {
  if (a.created_at < b.created_at) {
    return 1;
  }

  if (a.created_at > b.created_at) {
    return -1;
  }
  return 0;
}

export function titleComparator(
  a: { title: string },
  b: { title: string },
): number {
  return a.title.localeCompare(b.title, undefined, {
    sensitivity: 'base',
    numeric: true,
  });
}
