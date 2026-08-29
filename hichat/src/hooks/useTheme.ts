import { useUIStore } from '../store/ui.store';

export const useTheme = () => {
  const theme = useUIStore((state) => state.theme);
  const toggleTheme = useUIStore((state) => state.toggleTheme);

  return {
    theme,
    isDark: theme === 'dark',
    toggleTheme,
  };
};
