import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

// Hardcoded sidecar base for v0. Plan: read from a setting once we
// ship a settings panel for the threadhop integration.
const SIDECAR_BASE = "http://127.0.0.1:8765";

type ProjectSummary = {
  cwd: string;
  session_count: number;
  last_modified: number | null;
};

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

type MessageRow = {
  uuid: string;
  session_id: string;
  role: string;
  text: string;
  timestamp: string | null;
  parent_uuid: string | null;
};

type LibrarySearch = {
  project?: string | undefined;
  session?: string | undefined;
};

export const Route = createFileRoute("/library")({
  validateSearch: (search: Record<string, unknown>): LibrarySearch => {
    const out: LibrarySearch = {};
    if (typeof search.project === "string") out.project = search.project;
    if (typeof search.session === "string") out.session = search.session;
    return out;
  },
  component: LibraryRoute,
});

function LibraryRoute() {
  const { project, session } = Route.useSearch();
  return (
    <div className="flex h-full w-full flex-col bg-background text-foreground">
      <Header project={project} session={session} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!project ? (
          <ProjectList />
        ) : !session ? (
          <SessionList project={project} />
        ) : (
          <MessagesView sessionId={session} project={project} />
        )}
      </div>
    </div>
  );
}

function Header({
  project,
  session,
}: {
  project?: string | undefined;
  session?: string | undefined;
}) {
  return (
    <header className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm">
      <Link to="/library" className="font-medium hover:underline">
        Library
      </Link>
      {project ? (
        <>
          <span className="text-muted-foreground">/</span>
          <Link
            to="/library"
            search={{ project }}
            className="max-w-md truncate hover:underline"
            title={project}
          >
            {shortenCwd(project)}
          </Link>
        </>
      ) : null}
      {session ? (
        <>
          <span className="text-muted-foreground">/</span>
          <span className="font-mono text-xs text-muted-foreground">
            {session.slice(0, 8)}
          </span>
        </>
      ) : null}
    </header>
  );
}

function ProjectList() {
  const { data, isPending, error } = useQuery<ProjectSummary[]>({
    queryKey: ["library", "projects"],
    queryFn: async () => {
      const r = await fetch(`${SIDECAR_BASE}/projects`);
      if (!r.ok) throw new Error(`sidecar ${r.status}`);
      return r.json();
    },
  });
  const navigate = useNavigate();

  if (isPending) return <Centered>Loading projects…</Centered>;
  if (error) return <SidecarError error={error} />;
  if (!data || data.length === 0)
    return <Centered>No indexed projects yet.</Centered>;

  return (
    <ul className="divide-y divide-border">
      {data.map((p) => (
        <li key={p.cwd}>
          <button
            type="button"
            onClick={() =>
              navigate({ to: "/library", search: { project: p.cwd } })
            }
            className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-accent/30"
          >
            <span className="truncate font-mono text-sm" title={p.cwd}>
              {shortenCwd(p.cwd)}
            </span>
            <span className="ml-4 shrink-0 text-xs text-muted-foreground">
              {p.session_count} session{p.session_count === 1 ? "" : "s"}
              {p.last_modified
                ? ` · ${formatRelative(p.last_modified)}`
                : ""}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function SessionList({ project }: { project: string }) {
  const { data, isPending, error } = useQuery<SessionSummary[]>({
    queryKey: ["library", "sessions", project],
    queryFn: async () => {
      const r = await fetch(
        `${SIDECAR_BASE}/sessions?project=${encodeURIComponent(project)}`,
      );
      if (!r.ok) throw new Error(`sidecar ${r.status}`);
      return r.json();
    },
  });
  const navigate = useNavigate();

  if (isPending) return <Centered>Loading sessions…</Centered>;
  if (error) return <SidecarError error={error} />;
  if (!data || data.length === 0)
    return <Centered>No sessions for this project.</Centered>;

  return (
    <ul className="divide-y divide-border">
      {data.map((s) => (
        <li key={s.session_id}>
          <button
            type="button"
            onClick={() =>
              navigate({
                to: "/library",
                search: { project, session: s.session_id },
              })
            }
            className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-accent/30"
          >
            <span className="font-mono text-xs">
              {s.custom_name ?? s.session_id.slice(0, 8)}
            </span>
            <span className="ml-4 shrink-0 text-xs text-muted-foreground">
              {s.status !== "active" ? `${s.status} · ` : ""}
              {s.modified_at ? formatRelative(s.modified_at) : "—"}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function MessagesView({
  sessionId,
}: {
  sessionId: string;
  project: string;
}) {
  const { data, isPending, error } = useQuery<MessageRow[]>({
    queryKey: ["library", "messages", sessionId],
    queryFn: async () => {
      const r = await fetch(
        `${SIDECAR_BASE}/sessions/${encodeURIComponent(sessionId)}/messages`,
      );
      if (!r.ok) throw new Error(`sidecar ${r.status}`);
      return r.json();
    },
  });

  if (isPending) return <Centered>Loading messages…</Centered>;
  if (error) return <SidecarError error={error} />;
  if (!data || data.length === 0)
    return <Centered>No messages in this session.</Centered>;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-6">
      {data.map((m) => (
        <article
          key={m.uuid}
          className="rounded-md border border-border bg-card p-4"
        >
          <header className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium uppercase tracking-wide">
              {m.role}
            </span>
            {m.timestamp ? <span>· {m.timestamp}</span> : null}
          </header>
          <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">
            {m.text}
          </pre>
        </article>
      ))}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function SidecarError({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-sm">
      <p className="text-destructive">Sidecar error: {msg}</p>
      <p className="text-muted-foreground">
        Is{" "}
        <code className="rounded bg-muted px-1">threadhop serve</code> running
        on {SIDECAR_BASE}?
      </p>
    </div>
  );
}

function shortenCwd(cwd: string): string {
  const home = "/Users/nandakumar";
  return cwd.startsWith(home) ? "~" + cwd.slice(home.length) : cwd;
}

function formatRelative(epochSeconds: number): string {
  const ms = epochSeconds * 1000;
  const diff = Date.now() - ms;
  if (diff < 0) return "just now";
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}
