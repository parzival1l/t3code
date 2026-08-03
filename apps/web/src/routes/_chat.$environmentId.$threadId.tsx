import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import ChatView from "../components/ChatView";
import { threadHasStarted } from "../components/ChatView.logic";
import { finalizePromotedDraftThreadByRef, useComposerDraftStore } from "../composerDraftStore";
import { hydrateLibraryThread } from "../library/hydrateLibraryThread";
import { isLibraryThreadId, sessionIdFromLibraryThreadId } from "../library/isLibraryThread";
import { resolveThreadRouteRef, resolveThreadRouteRenderState } from "../threadRoutes";
import { resolveThreadSyncPhase } from "../threadSync";
import { SidebarInset } from "~/components/ui/sidebar";
import {
  useEnvironmentThreadRefs,
  useThreadDetail,
  useThreadShell,
  useThreadStatus,
} from "../state/entities";
import { useEnvironmentQuery } from "../state/query";
import { environmentShell } from "../state/shell";

function ChatThreadRouteView() {
  const navigate = useNavigate();
  const threadRef = Route.useParams({
    select: (params) => resolveThreadRouteRef(params),
  });
  const shell = useEnvironmentQuery(
    threadRef === null ? null : environmentShell.stateAtom(threadRef.environmentId),
  );
  const serverThreadShell = useThreadShell(threadRef);
  const serverThreadDetail = useThreadDetail(threadRef);
  const serverThreadStatus = useThreadStatus(threadRef);
  const environmentThreadRefs = useEnvironmentThreadRefs(threadRef?.environmentId ?? null);
  const bootstrapComplete = shell.data?.snapshot._tag === "Some";
  const environmentHasServerThreads = environmentThreadRefs.length > 0;
  const draftThreadExists = useComposerDraftStore((store) =>
    threadRef ? store.getDraftThreadByRef(threadRef) !== null : false,
  );
  const draftThread = useComposerDraftStore((store) =>
    threadRef ? store.getDraftThreadByRef(threadRef) : null,
  );
  const environmentHasDraftThreads = useComposerDraftStore((store) => {
    if (!threadRef) {
      return false;
    }
    return store.hasDraftThreadsInEnvironment(threadRef.environmentId);
  });
  const renderState = resolveThreadRouteRenderState({
    bootstrapComplete,
    serverThreadShellExists: serverThreadShell !== null,
    serverThreadDetailExists: serverThreadDetail !== null,
    serverThreadDetailDeleted: serverThreadStatus === "deleted",
    draftThreadExists,
  });
  const threadSyncPhase = resolveThreadSyncPhase({
    detailExists: serverThreadDetail !== null,
    shellExists: serverThreadShell !== null,
    status: serverThreadStatus,
  });
  const serverThreadStarted = threadHasStarted(serverThreadDetail);
  const environmentHasAnyThreads = environmentHasServerThreads || environmentHasDraftThreads;
  const isLibraryRoute = threadRef ? isLibraryThreadId(threadRef.threadId) : false;
  const libraryThreadPresent = serverThreadDetail !== null;
  const [libraryHydrationError, setLibraryHydrationError] = useState<string | null>(null);

  useEffect(() => {
    if (!threadRef || !bootstrapComplete) {
      return;
    }

    // Library (synthetic past-chat) routes are hydrated lazily from the
    // threadhop sidecar; never bounce them to "/" before the hydration
    // effect below has had a chance to run.
    if (isLibraryRoute) {
      return;
    }

    if (renderState === "missing" && environmentHasAnyThreads) {
      void navigate({ to: "/", replace: true });
    }
  }, [
    bootstrapComplete,
    environmentHasAnyThreads,
    isLibraryRoute,
    navigate,
    renderState,
    threadRef,
  ]);

  // Refresh-resilience: when the route lands on `/<envId>/library-<sessionId>`
  // (deep link or page reload), the synthetic thread is not yet in state
  // because the react-query cache is empty after a hard reload. Fetch from the
  // sidecar and inject so the chat view can render normally.
  useEffect(() => {
    if (!threadRef || !isLibraryRoute || libraryThreadPresent) {
      return;
    }
    const sessionId = sessionIdFromLibraryThreadId(threadRef.threadId);
    if (!sessionId) {
      return;
    }
    let cancelled = false;
    void hydrateLibraryThread({
      environmentId: threadRef.environmentId,
      sessionId,
    }).catch((err: unknown) => {
      if (cancelled) return;
      setLibraryHydrationError(err instanceof Error ? err.message : String(err));
      console.error("[library-route] hydrate failed", sessionId, err);
    });
    return () => {
      cancelled = true;
    };
  }, [isLibraryRoute, libraryThreadPresent, threadRef]);

  useEffect(() => {
    if (!threadRef || !serverThreadStarted || !draftThread) {
      return;
    }
    finalizePromotedDraftThreadByRef(threadRef);
  }, [draftThread, serverThreadStarted, threadRef]);

  if (!threadRef) {
    return null;
  }

  if (isLibraryRoute && !libraryThreadPresent) {
    return (
      <SidebarInset className="flex h-dvh min-h-0 items-center justify-center bg-background text-foreground">
        <div className="text-center text-muted-foreground text-xs">
          {libraryHydrationError ? (
            <>
              <div className="font-medium text-destructive">Failed to load past chat</div>
              <div className="mt-1">{libraryHydrationError}</div>
            </>
          ) : (
            <>Loading past chat…</>
          )}
        </div>
      </SidebarInset>
    );
  }

  return (
    <SidebarInset className="h-svh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground md:h-dvh">
      {renderState === "ready" || (renderState === "loading" && serverThreadShell !== null) ? (
        <ChatView
          environmentId={threadRef.environmentId}
          threadId={threadRef.threadId}
          routeKind="server"
          threadSyncPhase={threadSyncPhase}
        />
      ) : null}
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/$environmentId/$threadId")({
  component: ChatThreadRouteView,
});
