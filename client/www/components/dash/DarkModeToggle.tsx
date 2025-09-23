import { SunIcon, MoonIcon } from '@heroicons/react/24/solid';
import { Button } from '@/components/ui';
import { atom, useAtom } from 'jotai';
import { useRouter } from 'next/router';

export const getDefaultDarkMode = () => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('darkMode');
    if (saved !== null) {
      return JSON.parse(saved);
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  return false;
};

const darkModeAtom = atom(getDefaultDarkMode());

export function useDarkMode() {
  const router = useRouter();
  const [darkMode, setDarkMode] = useAtom(darkModeAtom);

  const toggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);

    // Save to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('darkMode', JSON.stringify(newMode));
    }

    // Send message to any iframes (like devtool)
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach((iframe) => {
      try {
        iframe.contentWindow?.postMessage(
          { type: 'darkModeChange', darkMode: newMode },
          '*',
        );
      } catch (e) {
        // Ignore cross-origin errors
      }
    });
  };

  return {
    // we use this hook outside of tailwind for things like monaco
    darkMode: router.pathname.startsWith('/dash') ? darkMode : false,
    toggleDarkMode,
  };
}

export function DarkModeToggle() {
  const { darkMode, toggleDarkMode } = useDarkMode();

  return (
    <Button
      size="nano"
      variant="subtle"
      className="bg-transparent py-2 rounded"
      onClick={toggleDarkMode}
      aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {darkMode ? (
        <SunIcon className="h-5 w-5 opacity-50" />
      ) : (
        <MoonIcon className="h-4 w-4 opacity-40" />
      )}
    </Button>
  );
}
