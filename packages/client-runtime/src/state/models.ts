import type {
  EnvironmentId,
  OrchestrationMessage,
  OrchestrationProjectShell,
  OrchestrationShellSnapshot,
  OrchestrationThread,
  OrchestrationThreadShell,
  ThreadId,
} from "@t3tools/contracts";

export interface EnvironmentProject extends OrchestrationProjectShell {
  readonly environmentId: EnvironmentId;
}

/**
 * Library view: synthetic read-only past-chat threads carry this flag so the
 * composer, WS subscription, branch toolbar, and other live affordances can opt
 * out. Server-sourced threads never set it.
 */
export interface LibraryReadOnly {
  readonly readOnly?: true | undefined;
}

export interface EnvironmentThreadShell extends OrchestrationThreadShell, LibraryReadOnly {
  readonly environmentId: EnvironmentId;
}

export type EnvironmentMessage = OrchestrationMessage;

export interface EnvironmentThread extends OrchestrationThread, LibraryReadOnly {
  readonly environmentId: EnvironmentId;
}

export function scopeProject(
  environmentId: EnvironmentId,
  project: OrchestrationProjectShell,
): EnvironmentProject {
  return { ...project, environmentId };
}

export function scopeThreadShell(
  environmentId: EnvironmentId,
  thread: OrchestrationThreadShell,
): EnvironmentThreadShell {
  return { ...thread, environmentId };
}

export function scopeThread(
  environmentId: EnvironmentId,
  thread: OrchestrationThread,
): EnvironmentThread {
  return { ...thread, environmentId };
}

export function selectEnvironmentThreadShell(
  snapshot: OrchestrationShellSnapshot | null,
  environmentId: EnvironmentId,
  threadId: ThreadId,
): EnvironmentThreadShell | null {
  const thread = snapshot?.threads.find((candidate) => candidate.id === threadId) ?? null;
  return thread ? scopeThreadShell(environmentId, thread) : null;
}
