import { AsyncLocalStorage } from 'node:async_hooks';
export const requestContext = new AsyncLocalStorage<{
  requestId: string;
  userId?: string;
  pactId?: string;
}>();
