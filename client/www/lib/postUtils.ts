import type { Author, Post } from './posts';

export function authorFirstName(author: Author): string {
  return author.name.split(' ')[0];
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
