import { useUIStore } from '../store/ui.store';

export const useUI = () => {
  const {
    theme,
    sidebarOpen,
    rightDrawerOpen,
    soundEnabled,
    activeModal,
    notificationQueue,
    toggleTheme,
    toggleSidebar,
    setIsSidebarOpen,
    toggleRightDrawer,
    setIsRightDrawerOpen,
    toggleSound,
    setSoundEnabled,
    openModal,
    closeModal,
    pushNotification,
    removeNotification,
  } = useUIStore();

  return {
    theme,
    isDark: theme === 'dark',
    sidebarOpen,
    rightDrawerOpen,
    soundEnabled,
    activeModal,
    notificationQueue,
    toggleTheme,
    toggleSidebar,
    setIsSidebarOpen,
    toggleRightDrawer,
    setIsRightDrawerOpen,
    toggleSound,
    setSoundEnabled,
    openModal,
    closeModal,
    pushNotification,
    removeNotification,
  };
};
