export function localStorageProvider() {
  if (typeof window === 'undefined') {
    console.log('localStorageProvider: window is undefined');
    return new Map();
  }
  const map = new Map(
    JSON.parse(localStorage.getItem(`something-cache`) || '[]'),
  );

  window.addEventListener('beforeunload', () => {
    const appCache = JSON.stringify(Array.from(map.entries()));
    localStorage.setItem(`something-cache`, appCache);
  });

  return map;
}
