export function formatBytes(bytes: number) {
  const units = ['bytes', 'kb', 'mb', 'gb', 'tb', 'pb', 'eb', 'zb', 'yb'];
  let index = 0;

  if (!bytes) return '0 bytes';

  while (bytes >= 1024 && index < units.length - 1) {
    bytes /= 1024;
    index++;
  }

  return bytes.toFixed(2) + ' ' + units[index];
}
