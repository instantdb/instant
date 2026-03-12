import type { Author, Post } from './posts';

export function abbreviateAuthorName(name: string): string {
  const [firstName, lastName] = name.split(' ');
  if (!lastName) return firstName;
  return `${firstName} ${lastName[0]}.`;
}

export function formatAuthorByline(authors: Author[]): string {
  if (authors.length === 1) return authors[0].name;
  return authors.map((author) => abbreviateAuthorName(author.name)).join(' & ');
}

export function formatDuration(post: Pick<Post, 'duration'>): string {
  const mins = post.duration.minutes;
  const label = post.duration.type;
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const minutes = mins % 60;
    return minutes > 0
      ? `${hours}h ${minutes}m ${label}`
      : `${hours}h ${label}`;
  }
  return `${mins} min ${label}`;
}
