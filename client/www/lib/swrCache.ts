export function localStorageProvider() {
  if (typeof window === 'undefined') {
    return new Map();
  }
  const map = new Map(JSON.parse(localStorage.getItem(`swr-cache`) || '[]'));

  window.addEventListener('beforeunload', () => {
    const appCache = JSON.stringify(Array.from(map.entries()));
    localStorage.setItem(`swr-cache`, appCache);
  });

  return map;
}
