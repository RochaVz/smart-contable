import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

const STORAGE_KEY = 'smartcontable-theme';

const getInitialTheme = () => {
  const savedTheme = localStorage.getItem(STORAGE_KEY);
  if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
};

const ThemeToggle = () => {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const isLight = theme === 'light';

  return (
    <button
      type="button"
      onClick={() => setTheme(isLight ? 'dark' : 'light')}
      aria-label={isLight ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
      title={isLight ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
      className="fixed bottom-5 right-5 z-[70] flex h-11 w-11 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-amber-300 shadow-xl shadow-black/25 transition-all hover:scale-105 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-950"
    >
      {isLight ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
    </button>
  );
};

export default ThemeToggle;
