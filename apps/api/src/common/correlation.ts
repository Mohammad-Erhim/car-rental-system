import { AsyncLocalStorage } from 'node:async_hooks';

export interface CorrelationContext {
  requestId: string;
  traceId: string;
  /** pseudonymous scoped actor id, when authenticated (SRS-OBS-001) */
  actorId?: string;
  actorType?: 'customer' | 'staff' | 'system' | 'anonymous';
}

const storage = new AsyncLocalStorage<CorrelationContext>();

export function runWithCorrelation<T>(ctx: CorrelationContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getCorrelation(): CorrelationContext | undefined {
  return storage.getStore();
}

export function currentRequestId(): string {
  return storage.getStore()?.requestId ?? 'no-request-context';
}

export function currentTraceId(): string {
  return storage.getStore()?.traceId ?? 'no-trace-context';
}

export function setActor(actorId: string, actorType: CorrelationContext['actorType']): void {
  const store = storage.getStore();
  if (store) {
    store.actorId = actorId;
    store.actorType = actorType;
  }
}
