import type { ThreadId } from "@t3tools/contracts";

// Synthetic threads hydrated from the threadhop sidecar use this prefix on
// their thread id so they cannot collide with real server threads. The
// canonical read-only check is `thread.readOnly`; this helper exists for the
// few places that have a thread id but no thread record (e.g. WS subscribe
// gate inside the runtime service, route loader before hydration).
export const LIBRARY_THREAD_ID_PREFIX = "library-";

export function isLibraryThreadId(threadId: string | null | undefined): boolean {
  if (!threadId) return false;
  return threadId.startsWith(LIBRARY_THREAD_ID_PREFIX);
}

export function libraryThreadIdForSession(sessionId: string): ThreadId {
  return `${LIBRARY_THREAD_ID_PREFIX}${sessionId}` as ThreadId;
}

export function sessionIdFromLibraryThreadId(threadId: string): string | null {
  if (!threadId.startsWith(LIBRARY_THREAD_ID_PREFIX)) return null;
  return threadId.slice(LIBRARY_THREAD_ID_PREFIX.length);
}
