import type {
  EnvironmentId,
  MessageId,
  ModelSelection,
  ProjectId,
  ThreadId,
} from "@t3tools/contracts";
import type { ChatMessage, Thread } from "../types";
import { libraryThreadIdForSession } from "./isLibraryThread";

// Threadhop sidecar message row (raw shape from
// GET /sessions/{id}/messages on the local FastAPI sidecar).
export interface LibraryMessageRow {
  uuid: string;
  session_id: string;
  role: string;
  text: string;
  timestamp: string;
  parent_uuid: string | null;
}

export interface LibrarySessionSummary {
  session_id: string;
  session_path: string;
  project: string | null;
  cwd: string | null;
  custom_name: string | null;
  status: string;
  modified_at: number | null;
  created_at: number | null;
}

// All synthetic threads share this fake projectId so they can be filtered
// from per-project selectors without claiming a real project's thread list.
// No `Project` record exists in the store for this id; that is intentional.
const LIBRARY_PROJECT_ID = "library:past-chats" as ProjectId;

const LIBRARY_DEFAULT_MODEL: ModelSelection = {
  provider: "claudeAgent",
  model: "claude-sonnet-4-5",
};

function normalizeRole(role: string): ChatMessage["role"] {
  if (role === "user" || role === "assistant" || role === "system") return role;
  return "assistant";
}

function epochToIso(epochSeconds: number | null, fallback: string): string {
  if (epochSeconds === null || !Number.isFinite(epochSeconds)) return fallback;
  return new Date(epochSeconds * 1000).toISOString();
}

function buildTitle(session: LibrarySessionSummary): string {
  if (session.custom_name && session.custom_name.trim().length > 0) {
    return session.custom_name;
  }
  return `Past chat ${session.session_id.slice(0, 8)}`;
}

export interface SynthesizeLibraryThreadInput {
  environmentId: EnvironmentId;
  session: LibrarySessionSummary;
  messages: ReadonlyArray<LibraryMessageRow>;
}

export function synthesizeLibraryThread(input: SynthesizeLibraryThreadInput): Thread {
  const { environmentId, session, messages } = input;
  const threadId = libraryThreadIdForSession(session.session_id);
  const nowIso = new Date().toISOString();
  const createdAtIso = epochToIso(session.created_at ?? session.modified_at, nowIso);
  const updatedAtIso = epochToIso(session.modified_at ?? session.created_at, createdAtIso);

  const chatMessages: ChatMessage[] = messages.map((row) => ({
    id: row.uuid as MessageId,
    role: normalizeRole(row.role),
    text: row.text,
    turnId: null,
    createdAt: row.timestamp,
    completedAt: row.timestamp,
    streaming: false,
  }));

  return {
    id: threadId,
    environmentId,
    codexThreadId: null,
    projectId: LIBRARY_PROJECT_ID,
    title: buildTitle(session),
    modelSelection: LIBRARY_DEFAULT_MODEL,
    runtimeMode: "full-access",
    interactionMode: "default",
    session: null,
    messages: chatMessages,
    proposedPlans: [],
    error: null,
    createdAt: createdAtIso,
    archivedAt: null,
    updatedAt: updatedAtIso,
    latestTurn: null,
    branch: null,
    worktreePath: null,
    turnDiffSummaries: [],
    activities: [],
    readOnly: true,
  };
}

export function libraryProjectId(): ProjectId {
  return LIBRARY_PROJECT_ID;
}

export function isLibraryProjectId(projectId: ProjectId | string): boolean {
  return projectId === LIBRARY_PROJECT_ID;
}

export type LibraryThreadId = ThreadId;
