import { useEffect } from 'react';
import { SunIcon, MoonIcon } from '@heroicons/react/24/solid';
import { Button } from '@/components/ui';
import useLocalStorage from '@/lib/hooks/useLocalStorage';

export function DarkModeToggle() {
  const getDefaultDarkMode = () => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  };

  const [darkMode, setDarkMode] = useLocalStorage(
    'darkMode',
    getDefaultDarkMode(),
  );

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const toggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);

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

  return (
    <Button
      size="nano"
      variant="subtle"
      className="bg-transparent"
      onClick={toggleDarkMode}
      aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {darkMode ? (
        <SunIcon className="h-5 w-5" />
      ) : (
        <MoonIcon className="h-5 w-5" />
      )}
    </Button>
  );
}
