import { describe, it, expect, beforeEach } from 'vitest';
import {
  useUIStore,
  selectTheme,
  selectSidebarOpen,
  selectRightDrawerOpen,
  selectSoundEnabled,
  selectActiveModal,
  selectNotificationQueue,
} from '../ui.store';

describe('ui.store', () => {
  beforeEach(() => {
    useUIStore.setState({
      theme: 'dark',
      sidebarOpen: true,
      rightDrawerOpen: false,
      soundEnabled: true,
      activeModal: null,
      notificationQueue: [],
    });
  });

  it('initializes with dark theme and open sidebar', () => {
    const state = useUIStore.getState();
    expect(state.theme).toBe('dark');
    expect(state.sidebarOpen).toBe(true);
    expect(state.rightDrawerOpen).toBe(false);
    expect(state.soundEnabled).toBe(true);
    expect(state.activeModal).toBeNull();
  });

  it('toggles theme between dark and light', () => {
    useUIStore.getState().toggleTheme();
    expect(useUIStore.getState().theme).toBe('light');

    useUIStore.getState().toggleTheme();
    expect(useUIStore.getState().theme).toBe('dark');
  });

  it('toggles sidebar and right drawer states', () => {
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().sidebarOpen).toBe(false);

    useUIStore.getState().setIsSidebarOpen(true);
    expect(useUIStore.getState().sidebarOpen).toBe(true);

    useUIStore.getState().toggleRightDrawer();
    expect(useUIStore.getState().rightDrawerOpen).toBe(true);

    useUIStore.getState().setIsRightDrawerOpen(false);
    expect(useUIStore.getState().rightDrawerOpen).toBe(false);
  });

  it('manages sound toggle and modal open/close', () => {
    useUIStore.getState().toggleSound();
    expect(useUIStore.getState().soundEnabled).toBe(false);

    useUIStore.getState().setSoundEnabled(true);
    expect(useUIStore.getState().soundEnabled).toBe(true);

    useUIStore.getState().openModal('createRoom');
    expect(useUIStore.getState().activeModal).toBe('createRoom');

    useUIStore.getState().closeModal();
    expect(useUIStore.getState().activeModal).toBeNull();
  });

  it('pushes and removes notifications', () => {
    const notif1 = { id: 'n1', text: 'New message' };
    const notif2 = { id: 'n2', text: 'Key updated' };

    useUIStore.getState().pushNotification(notif1);
    useUIStore.getState().pushNotification(notif2);
    expect(useUIStore.getState().notificationQueue).toHaveLength(2);

    useUIStore.getState().removeNotification('n1');
    expect(useUIStore.getState().notificationQueue).toEqual([notif2]);
  });

  it('exports accurate UI state selectors', () => {
    const mockState = {
      theme: 'dark',
      sidebarOpen: false,
      rightDrawerOpen: true,
      soundEnabled: true,
      activeModal: 'fingerprint',
      notificationQueue: [{ id: '1' }],
    } as any;

    expect(selectTheme(mockState)).toBe('dark');
    expect(selectSidebarOpen(mockState)).toBe(false);
    expect(selectRightDrawerOpen(mockState)).toBe(true);
    expect(selectSoundEnabled(mockState)).toBe(true);
    expect(selectActiveModal(mockState)).toBe('fingerprint');
    expect(selectNotificationQueue(mockState)).toHaveLength(1);
  });
});
