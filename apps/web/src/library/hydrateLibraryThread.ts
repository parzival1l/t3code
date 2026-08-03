import type { EnvironmentId, ThreadId } from "@t3tools/contracts";

import { readThreadDetail } from "../state/entities";
import {
  type LibraryMessageRow,
  type LibrarySessionSummary,
  synthesizeLibraryThread,
} from "./synthesizeThread";
import { libraryThreadIdForSession } from "./isLibraryThread";

// TODO: Read from settings once a threadhop preferences panel exists. The
// sidebar's session-list query uses the same constant — keep them in sync.
const SIDECAR_BASE = "http://127.0.0.1:8765";

async function fetchLibraryMessages(sessionId: string): Promise<LibraryMessageRow[]> {
  const response = await fetch(
    `${SIDECAR_BASE}/sessions/${encodeURIComponent(sessionId)}/messages`,
  );
  if (!response.ok) {
    throw new Error(`Threadhop sidecar returned ${response.status} for session ${sessionId}`);
  }
  return (await response.json()) as LibraryMessageRow[];
}

// Best-effort metadata lookup for refresh-resilience: if the user lands
// directly on a library URL (page reload, deep link), Phase A's react-query
// cache is empty so we don't have a SessionSummary in hand. We try the
// sidecar's projects -> sessions index and pick the matching id. If nothing
// matches we synthesize a minimal placeholder summary so the chat view can
// still render the messages — the user just sees a less informative title.
async function lookupSessionSummary(sessionId: string): Promise<LibrarySessionSummary> {
  try {
    const projectsResponse = await fetch(`${SIDECAR_BASE}/projects`);
    if (projectsResponse.ok) {
      const projects = (await projectsResponse.json()) as Array<{ cwd: string }>;
      for (const project of projects) {
        const sessionsResponse = await fetch(
          `${SIDECAR_BASE}/sessions?project=${encodeURIComponent(project.cwd)}`,
        );
        if (!sessionsResponse.ok) continue;
        const sessions = (await sessionsResponse.json()) as LibrarySessionSummary[];
        const match = sessions.find((session) => session.session_id === sessionId);
        if (match) return match;
      }
    }
  } catch {
    // Fall through to placeholder.
  }
  return {
    session_id: sessionId,
    session_path: "",
    project: null,
    cwd: null,
    custom_name: null,
    status: "unknown",
    modified_at: null,
    created_at: null,
  };
}

export interface HydrateLibraryThreadInput {
  environmentId: EnvironmentId;
  sessionId: string;
  // Optional cached SessionSummary from Phase A's react-query data. When
  // present (i.e. the user clicked a sidebar row in the same session) we
  // skip the metadata lookup entirely.
  session?: LibrarySessionSummary;
}

export interface HydrateLibraryThreadResult {
  threadId: ThreadId;
}

// Idempotent: if the synthetic thread is already in state, returns its id
// without refetching. Caller uses the returned id for navigation; the route
// calls this on mount when the route's threadId starts with `library-` and is
// not yet in state (refresh-resilience path).
//
// PORT REQUIRED — upstream e95b57dc2 ("Rewrite client connection architecture")
// deleted the zustand store this used to write into. `EnvironmentThread` values
// are now derived read-only from `threadStateAtom`, which only the connection
// layer feeds. There is no client-side injection seam, so synthetic threads
// cannot be written into state yet. Two viable ports:
//   1. Add a local-override atom layered into `threadStateAtom` in
//      packages/client-runtime/src/state/threadDetail.ts.
//   2. Synthesize orchestration events and push them through threadReducer.
// Everything below the fetch/synthesize line still works and is kept intact so
// the port only has to replace the final write.
export async function hydrateLibraryThread(
  input: HydrateLibraryThreadInput,
): Promise<HydrateLibraryThreadResult> {
  const { environmentId, sessionId } = input;
  const threadId = libraryThreadIdForSession(sessionId);

  const existing = readThreadDetail({ environmentId, threadId });
  if (existing?.readOnly) {
    return { threadId };
  }

  const session = input.session ?? (await lookupSessionSummary(sessionId));
  const messages = await fetchLibraryMessages(sessionId);
  const thread = synthesizeLibraryThread({ environmentId, session, messages });
  void thread;
  throw new Error(
    "Library threads cannot be injected yet: the client state rewrite removed the store write path. See the PORT REQUIRED note in hydrateLibraryThread.ts.",
  );
}
