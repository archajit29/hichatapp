import { describe, it, expect } from 'vitest';
import { ENV, validateEnv } from '../env';

describe('env configuration', () => {
  it('provides default fallback API and Server URLs', () => {
    expect(ENV.apiUrl).toBeDefined();
    expect(ENV.serverUrl).toBeDefined();
    expect(ENV.wsUrl).toBeDefined();
    expect(typeof ENV.isProduction).toBe('boolean');
  });

  it('validates environment settings', () => {
    const result = validateEnv();
    expect(typeof result.valid).toBe('boolean');
    expect(Array.isArray(result.warnings)).toBe(true);
  });
});
