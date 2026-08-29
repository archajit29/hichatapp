import { useUIStore } from '../store/ui.store';

export const useUI = () => {
  const theme = useUIStore((state) => state.theme);
  const sidebarOpen = useUIStore((state) => state.sidebarOpen);
  const rightDrawerOpen = useUIStore((state) => state.rightDrawerOpen);
  const soundEnabled = useUIStore((state) => state.soundEnabled);
  const activeModal = useUIStore((state) => state.activeModal);
  const notificationQueue = useUIStore((state) => state.notificationQueue);
  const toggleTheme = useUIStore((state) => state.toggleTheme);
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const setIsSidebarOpen = useUIStore((state) => state.setIsSidebarOpen);
  const toggleRightDrawer = useUIStore((state) => state.toggleRightDrawer);
  const setIsRightDrawerOpen = useUIStore((state) => state.setIsRightDrawerOpen);
  const toggleSound = useUIStore((state) => state.toggleSound);
  const setSoundEnabled = useUIStore((state) => state.setSoundEnabled);
  const openModal = useUIStore((state) => state.openModal);
  const closeModal = useUIStore((state) => state.closeModal);
  const pushNotification = useUIStore((state) => state.pushNotification);
  const removeNotification = useUIStore((state) => state.removeNotification);

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
