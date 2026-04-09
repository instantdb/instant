export function toTitleCase(str: string): string {
  return str
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
