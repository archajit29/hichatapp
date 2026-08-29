/**
 * Environment configuration validator and provider.
 * Safely resolves and validates frontend runtime environment variables.
 */

export interface EnvConfig {
  apiUrl: string;
  serverUrl: string;
  wsUrl: string;
  isProduction: boolean;
  isDevelopment: boolean;
  isTest: boolean;
}

function getEnvVar(key: string, fallback: string): string {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const val = import.meta.env[key];
    if (typeof val === 'string' && val.trim() !== '') {
      return val.trim();
    }
  }
  return fallback;
}

const mode = (typeof import.meta !== 'undefined' && import.meta.env?.MODE) || 'development';

export const ENV: EnvConfig = {
  apiUrl: getEnvVar('VITE_API_URL', 'http://localhost:3001/api'),
  serverUrl: getEnvVar('VITE_SERVER_URL', 'http://localhost:8080'),
  wsUrl: getEnvVar('VITE_WS_URL', getEnvVar('VITE_SOCKET_URL', 'http://localhost:8080')),
  isProduction: mode === 'production',
  isDevelopment: mode === 'development',
  isTest: mode === 'test' || typeof process !== 'undefined' && process.env?.NODE_ENV === 'test',
};

export function validateEnv(): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];
  if (!ENV.apiUrl) {
    warnings.push('VITE_API_URL is unset, falling back to localhost:3001/api');
  }
  if (!ENV.serverUrl) {
    warnings.push('VITE_SERVER_URL is unset, falling back to localhost:8080');
  }
  return {
    valid: warnings.length === 0,
    warnings,
  };
}
