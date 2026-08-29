import { AsyncLocalStorage } from "async_hooks";

export interface RequestContextStore {
  requestId?: string;
  userId?: string;
  username?: string;
  module?: string;
  [key: string]: any;
}

/**
 * AsyncLocalStorage instance for carrying Request ID and user context
 * across asynchronous execution chains (HTTP requests, DB queries, Socket handlers).
 */
export const requestContext = new AsyncLocalStorage<RequestContextStore>();

/**
 * Helper to get the current requestId from active async context.
 */
export function getCurrentRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}

/**
 * Helper to get the current userId from active async context.
 */
export function getCurrentUserId(): string | undefined {
  return requestContext.getStore()?.userId;
}
