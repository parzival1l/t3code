import { memo, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRightIcon, HistoryIcon } from "lucide-react";

import {
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "./ui/sidebar";

const RENDER_AS_BUTTON = <button type="button" />;

// TODO: read from settings once a threadhop preferences panel exists.
const SIDECAR_BASE = "http://127.0.0.1:8765";

const PAST_CHAT_PREVIEW_LIMIT = 6;

// Phase A scope: t3code's own project rail is canonical. We surface threadhop
// sessions only for projects that already exist in the rail, keyed by the
// representative project's `cwd`. Projects merged via
// `sidebarProjectGroupingOverrides` only show past chats for that single cwd
// (cross-merged aggregation is out of scope for Phase A). Threadhop-indexed
// projects without a matching t3code project don't surface anywhere yet.

type SessionSummary = {
  session_id: string;
  session_path: string;
  project: string | null;
  cwd: string | null;
  custom_name: string | null;
  status: string;
  modified_at: number | null;
  created_at: number | null;
};

interface SidebarPastChatsSectionProps {
  projectKey: string;
  projectCwd: string;
  projectExpanded: boolean;
  isPastChatsExpanded: boolean;
  isPastChatsListExpanded: boolean;
  expandPastChatsForProject: (projectKey: string) => void;
  collapsePastChatsForProject: (projectKey: string) => void;
  expandPastChatsListForProject: (projectKey: string) => void;
  collapsePastChatsListForProject: (projectKey: string) => void;
}

export const SidebarPastChatsSection = memo(function SidebarPastChatsSection(
  props: SidebarPastChatsSectionProps,
) {
  const {
    projectKey,
    projectCwd,
    projectExpanded,
    isPastChatsExpanded,
    isPastChatsListExpanded,
    expandPastChatsForProject,
    collapsePastChatsForProject,
    expandPastChatsListForProject,
    collapsePastChatsListForProject,
  } = props;

  if (!projectExpanded) return null;

  return (
    <SidebarMenuSub className="mx-1 my-0 w-full translate-x-0 gap-0.5 overflow-hidden px-1.5 py-0">
      <SidebarMenuSubItem className="w-full">
        <SidebarMenuSubButton
          render={RENDER_AS_BUTTON}
          data-thread-selection-safe
          size="sm"
          className="h-6 w-full translate-x-0 justify-start gap-2 px-2 text-left text-[10px] text-muted-foreground/60 hover:bg-accent hover:text-muted-foreground/80"
          onClick={() => {
            if (isPastChatsExpanded) {
              collapsePastChatsForProject(projectKey);
            } else {
              expandPastChatsForProject(projectKey);
            }
          }}
        >
          <ChevronRightIcon
            className={`size-3 shrink-0 text-muted-foreground/70 transition-transform duration-150 ${
              isPastChatsExpanded ? "rotate-90" : ""
            }`}
          />
          <HistoryIcon className="size-3 shrink-0 text-muted-foreground/70" />
          <span className="truncate">Past chats</span>
        </SidebarMenuSubButton>
      </SidebarMenuSubItem>

      {isPastChatsExpanded ? (
        <PastChatsList
          projectKey={projectKey}
          projectCwd={projectCwd}
          isPastChatsListExpanded={isPastChatsListExpanded}
          expandPastChatsListForProject={expandPastChatsListForProject}
          collapsePastChatsListForProject={collapsePastChatsListForProject}
        />
      ) : null}
    </SidebarMenuSub>
  );
});

interface PastChatsListProps {
  projectKey: string;
  projectCwd: string;
  isPastChatsListExpanded: boolean;
  expandPastChatsListForProject: (projectKey: string) => void;
  collapsePastChatsListForProject: (projectKey: string) => void;
}

function PastChatsList(props: PastChatsListProps) {
  const {
    projectKey,
    projectCwd,
    isPastChatsListExpanded,
    expandPastChatsListForProject,
    collapsePastChatsListForProject,
  } = props;

  const { data, isPending, error } = useQuery<SessionSummary[]>({
    queryKey: ["library", "sessions", projectCwd],
    queryFn: async () => {
      const r = await fetch(
        `${SIDECAR_BASE}/sessions?project=${encodeURIComponent(projectCwd)}`,
      );
      if (!r.ok) throw new Error(`sidecar ${r.status}`);
      return (await r.json()) as SessionSummary[];
    },
    staleTime: 30_000,
  });

  const sessions = data ?? [];
  const hasOverflow = sessions.length > PAST_CHAT_PREVIEW_LIMIT;
  const visible = useMemo(() => {
    if (isPastChatsListExpanded || !hasOverflow) return sessions;
    return sessions.slice(0, PAST_CHAT_PREVIEW_LIMIT);
  }, [sessions, isPastChatsListExpanded, hasOverflow]);

  if (isPending) {
    return (
      <PastChatsStateRow>Loading…</PastChatsStateRow>
    );
  }
  if (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return (
      <PastChatsStateRow tone="error">Sidecar error: {msg}</PastChatsStateRow>
    );
  }
  if (sessions.length === 0) {
    return <PastChatsStateRow>No past chats</PastChatsStateRow>;
  }

  return (
    <>
      {visible.map((session) => (
        <SessionRow key={session.session_id} session={session} />
      ))}
      {hasOverflow && !isPastChatsListExpanded ? (
        <SidebarMenuSubItem className="w-full">
          <SidebarMenuSubButton
            render={RENDER_AS_BUTTON}
            data-thread-selection-safe
            size="sm"
            className="h-6 w-full translate-x-0 justify-start px-2 text-left text-[10px] text-muted-foreground/60 hover:bg-accent hover:text-muted-foreground/80"
            onClick={() => expandPastChatsListForProject(projectKey)}
          >
            <span>Show more</span>
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
      ) : null}
      {hasOverflow && isPastChatsListExpanded ? (
        <SidebarMenuSubItem className="w-full">
          <SidebarMenuSubButton
            render={RENDER_AS_BUTTON}
            data-thread-selection-safe
            size="sm"
            className="h-6 w-full translate-x-0 justify-start px-2 text-left text-[10px] text-muted-foreground/60 hover:bg-accent hover:text-muted-foreground/80"
            onClick={() => collapsePastChatsListForProject(projectKey)}
          >
            <span>Show less</span>
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
      ) : null}
    </>
  );
}

function SessionRow({ session }: { session: SessionSummary }) {
  const label = session.custom_name ?? session.session_id.slice(0, 8);
  const showStatus = session.status !== "active";
  const relative = session.modified_at ? formatRelative(session.modified_at) : null;

  return (
    <SidebarMenuSubItem className="w-full">
      <SidebarMenuSubButton
        render={RENDER_AS_BUTTON}
        data-thread-selection-safe
        size="sm"
        className="h-6 w-full translate-x-0 justify-start gap-2 px-2 text-left text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
        onClick={() => {
          // TODO(phaseB): synthesize a read-only thread for this session and
          // route through MessagesTimeline.
          // eslint-disable-next-line no-console
          console.log("[past-chat] open session", session.session_id);
        }}
      >
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {showStatus ? (
          <span className="shrink-0 rounded bg-muted px-1 py-0 text-[9px] uppercase tracking-wide text-muted-foreground/80">
            {session.status}
          </span>
        ) : null}
        {relative ? (
          <span className="shrink-0 text-muted-foreground/60">{relative}</span>
        ) : null}
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  );
}

function PastChatsStateRow({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "error" | undefined;
}) {
  const toneClass = tone === "error" ? "text-destructive" : "text-muted-foreground/60";
  return (
    <SidebarMenuSubItem className="w-full" data-thread-selection-safe>
      <div
        data-thread-selection-safe
        className={`flex h-6 w-full translate-x-0 items-center px-2 text-left text-[10px] ${toneClass}`}
      >
        <span className="truncate">{children}</span>
      </div>
    </SidebarMenuSubItem>
  );
}

function formatRelative(epochSeconds: number): string {
  const ms = epochSeconds * 1000;
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.floor(mo / 12)}y`;
}
