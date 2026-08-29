import { useUIStore } from '../store/ui.store';

export const useTheme = () => {
  const { theme, toggleTheme } = useUIStore();

  return {
    theme,
    isDark: theme === 'dark',
    toggleTheme,
  };
};
