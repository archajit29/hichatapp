import { create } from 'zustand';

interface UIState {
  theme: 'light' | 'dark';
  sidebarOpen: boolean;
  rightDrawerOpen: boolean;
  soundEnabled: boolean;
  activeModal: string | null;
  notificationQueue: any[];

  toggleTheme: () => void;
  toggleSidebar: () => void;
  setIsSidebarOpen: (open: boolean) => void;
  toggleRightDrawer: () => void;
  setIsRightDrawerOpen: (open: boolean) => void;
  toggleSound: () => void;
  setSoundEnabled: (enabled: boolean) => void;
  openModal: (modalId: string) => void;
  closeModal: () => void;
  pushNotification: (notification: any) => void;
  removeNotification: (id: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  theme: 'dark',
  sidebarOpen: true,
  rightDrawerOpen: false,
  soundEnabled: true,
  activeModal: null,
  notificationQueue: [],

  toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setIsSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleRightDrawer: () => set((state) => ({ rightDrawerOpen: !state.rightDrawerOpen })),
  setIsRightDrawerOpen: (open) => set({ rightDrawerOpen: open }),
  toggleSound: () => set((state) => ({ soundEnabled: !state.soundEnabled })),
  setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),
  openModal: (modalId) => set({ activeModal: modalId }),
  closeModal: () => set({ activeModal: null }),
  pushNotification: (notification) => set((state) => ({ notificationQueue: [...state.notificationQueue, notification] })),
  removeNotification: (id) => set((state) => ({ 
    notificationQueue: state.notificationQueue.filter((n) => n.id !== id) 
  })),
}));

// Granular selector functions for UI state
export const selectTheme = (state: UIState) => state.theme;
export const selectSidebarOpen = (state: UIState) => state.sidebarOpen;
export const selectRightDrawerOpen = (state: UIState) => state.rightDrawerOpen;
export const selectSoundEnabled = (state: UIState) => state.soundEnabled;
export const selectActiveModal = (state: UIState) => state.activeModal;
export const selectNotificationQueue = (state: UIState) => state.notificationQueue;

