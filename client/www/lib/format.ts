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

// Converts numbers into shorter forms like 1.2k, 10.2m, etc.
export function formatNumberCompact(num: number) {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  })
    .format(num)
    .toLowerCase();
}
