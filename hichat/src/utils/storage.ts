/**
 * Safe local storage and session storage wrapper with optional serialization/deserialization.
 */

export const storage = {
  get: <T>(key: string, defaultValue: T | null = null): T | null => {
    try {
      const item = localStorage.getItem(key);
      if (item === null) return defaultValue;
      try {
        return JSON.parse(item) as T;
      } catch {
        return item as unknown as T;
      }
    } catch (err) {
      console.error('Error reading from localStorage', err);
      return defaultValue;
    }
  },

  set: <T>(key: string, value: T): void => {
    try {
      const valueToStore = typeof value === 'string' ? value : JSON.stringify(value);
      localStorage.setItem(key, valueToStore);
    } catch (err) {
      console.error('Error writing to localStorage', err);
    }
  },

  remove: (key: string): void => {
    try {
      localStorage.removeItem(key);
    } catch (err) {
      console.error('Error removing from localStorage', err);
    }
  },

  clear: (): void => {
    try {
      localStorage.clear();
    } catch (err) {
      console.error('Error clearing localStorage', err);
    }
  },
};
