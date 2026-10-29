"use client";

import {
  Activity, AlertCircle, Bot, Check, ChevronRight, Clock3, Menu, MessageSquare,
  MoonStar, PanelLeftClose, Plus, Send, Sparkles, SunMedium, Wrench, X,
} from "lucide-react";
import { FormEvent, Fragment, useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { ThemeSelector } from "@/components/theme-selector";
import { appConfig } from "@/config/app";
import type {
  ClientToolCall, RunResult, SessionDetail, SessionEvent, SessionHistoryItem,
  SessionSnapshot, StreamEnvelope, Usage,
} from "@/lib/types";
import { textContent } from "@/lib/types";

type ListResponse = { items?: SessionSnapshot[]; error?: string };
type ApiError = { error?: string };

function relativeTime(value: string) {
  const delta = Math.max(0, Date.now() - Date.parse(value));
  if (delta < 60_000) return "now";
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function outputText(value: unknown) {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  return JSON.stringify(value, null, 2);
}

async function consumeStream(response: Response, onEvent: (event: StreamEnvelope) => void) {
  if (!response.ok || !response.body) {
    const body = (await response.json().catch(() => ({}))) as ApiError;
    throw new Error(body.error || "The agent could not be reached.");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) onEvent(JSON.parse(line) as StreamEnvelope);
    if (done) break;
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer) as StreamEnvelope);
}

function StatusPill({ status, runStatus }: Pick<SessionSnapshot, "status" | "runStatus">) {
  const active = runStatus === "running" || runStatus === "waiting_for_subagent";
  const waiting = runStatus === "waiting_for_client_action";
  return (
    <span className="status-pill" data-tone={active ? "active" : waiting ? "waiting" : status}>
      <i /> {active ? "Running" : waiting ? "Input needed" : status}
    </span>
  );
}

function UsageLine({ usage }: { usage?: Usage }) {
  if (!usage) return <span>No token usage yet</span>;
  return (
    <span>
      {usage.inputTokens.toLocaleString()} in · {usage.outputTokens.toLocaleString()} out
      {usage.reasoningTokens ? ` · ${usage.reasoningTokens.toLocaleString()} reasoning` : ""}
    </span>
  );
}

function ApprovalCard({
  call, disabled, onResolve,
}: {
  call: ClientToolCall;
  disabled: boolean;
  onResolve: (output: Record<string, unknown>) => void;
}) {
  const args = call.arguments as { title?: unknown; summary?: unknown };
  const [note, setNote] = useState("");
  return (
    <section className="approval-card" aria-labelledby={`approval-${call.callId}`}>
      <div className="card-icon"><Check /></div>
      <div>
        <p className="eyebrow">Your decision</p>
        <h3 id={`approval-${call.callId}`}>{typeof args.title === "string" ? args.title : "Approve this step?"}</h3>
        <p>{typeof args.summary === "string" ? args.summary : "The agent needs your approval to continue."}</p>
        <label>
          Optional note
          <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} />
        </label>
        <div className="approval-actions">
          <button disabled={disabled} onClick={() => onResolve({ approved: false, note })}>Decline</button>
          <button className="primary" disabled={disabled} onClick={() => onResolve({ approved: true, note })}>Approve</button>
        </div>
      </div>
    </section>
  );
}

function ActivityCard({ item }: { item: SessionHistoryItem }) {
  const icons = {
    action: Wrench, client_action: Check, subagent: Bot, skill: Sparkles,
    evaluation: Activity, session_completed: Check,
  };
  const Icon = item.type === "message" ? MessageSquare : icons[item.type];
  return (
    <article className="activity-card" data-status={item.status}>
      <span className="activity-icon"><Icon /></span>
      <div>
        <div className="activity-heading">
          <strong>{item.name || item.type.replace("_", " ")}</strong>
          {item.status ? <span>{item.status}</span> : null}
        </div>
        {item.summary ? <p>{item.summary}</p> : null}
        {item.arguments ? <details><summary>Inputs</summary><pre>{JSON.stringify(item.arguments, null, 2)}</pre></details> : null}
        {item.metrics?.length ? (
          <div className="metrics">
            {item.metrics.map((metric) => <span key={metric.name}>{metric.name}: {Math.round(metric.score * 100)}%</span>)}
          </div>
        ) : null}
      </div>
      <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
    </article>
  );
}

function Timeline({
  detail, streaming,
}: {
  detail?: SessionDetail;
  streaming?: string;
}) {
  if (!detail && !streaming) return <EmptyState />;
  const items = detail?.history ?? [];
  return (
    <div className="timeline" aria-live="polite" aria-busy={Boolean(streaming)}>
      {items.map((item) => (
        <Fragment key={item.id}>
          {item.type === "message" ? (
            <article className={`message message-${item.role}`}>
              {item.role === "assistant" ? <span className="avatar"><Sparkles /></span> : null}
              <div>
                {item.role === "assistant" ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{textContent(item.content)}</ReactMarkdown>
                ) : <p>{textContent(item.content)}</p>}
              </div>
            </article>
          ) : <ActivityCard item={item} />}
        </Fragment>
      ))}
      {streaming ? (
        <article className="message message-assistant streaming">
          <span className="avatar"><Sparkles /></span>
          <div><ReactMarkdown remarkPlugins={[remarkGfm]}>{streaming}</ReactMarkdown><i /></div>
        </article>
      ) : null}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <span><MoonStar /></span>
      <p className="eyebrow">Agent workspace</p>
      <h1>Turn intent into visible progress.</h1>
      <p>Start an execution, watch every action unfold, and return to the durable session whenever you need.</p>
      <div className="suggestions">
        {appConfig.suggestedPrompts.map((item) => (
          <button key={item.title} type="button" data-prompt={item.prompt}>
            <strong>{item.title}</strong><span>{item.prompt}</span><ChevronRight />
          </button>
        ))}
      </div>
    </div>
  );
}

function EventInspector({ events }: { events: SessionEvent[] }) {
  if (!events.length) return <p className="muted">Events appear as the agent works.</p>;
  return (
    <ol className="event-list">
      {events.map((event) => (
        <li key={event.sequence}>
          <span>{event.sequence}</span>
          <div><strong>{event.type}</strong><time>{new Date(event.timestamp).toLocaleTimeString()}</time></div>
          <details><summary>Data</summary><pre>{JSON.stringify(event.data, null, 2)}</pre></details>
        </li>
      ))}
    </ol>
  );
}

export function AgentWorkspace() {
  const [sessions, setSessions] = useState<SessionSnapshot[]>([]);
  const [detail, setDetail] = useState<SessionDetail>();
  const [prompt, setPrompt] = useState("");
  const [streaming, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const refreshSessions = useCallback(async () => {
    const response = await fetch("/api/sessions", { cache: "no-store" });
    const data = (await response.json()) as ListResponse;
    if (!response.ok) throw new Error(data.error || "Sessions could not be loaded.");
    setSessions(data.items ?? []);
  }, []);

  const openSession = useCallback(async (sessionId: string) => {
    setLoading(true);
    setError(undefined);
    setSidebarOpen(false);
    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, { cache: "no-store" });
      const data = (await response.json()) as SessionDetail & ApiError;
      if (!response.ok) throw new Error(data.error || "Session could not be loaded.");
      setDetail(data);
      window.history.replaceState(null, "", `/?session=${encodeURIComponent(sessionId)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Session could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await refreshSessions();
        const initial = new URLSearchParams(window.location.search).get("session");
        if (initial) await openSession(initial);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "The workspace could not load.");
      } finally {
        setLoading(false);
      }
    })();
  }, [openSession, refreshSessions]);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: busy ? "smooth" : "auto" }), [busy, detail, streaming]);

  const handleEnvelope = (event: StreamEnvelope) => {
    if (event.type === "session") {
      window.history.replaceState(null, "", `/?session=${encodeURIComponent(event.sessionId)}`);
      setDetail((current) => current ? { ...current, sessionId: event.sessionId } : current);
    }
    if (event.type === "snapshot" && typeof event.snapshot === "object" && event.snapshot) {
      const snapshot = event.snapshot as { status?: string; output?: unknown };
      if (snapshot.status === "streaming") setStreaming(outputText(snapshot.output));
    }
    if (event.type === "result") {
      const result = event.result as RunResult;
      if (result.status === "failed") throw new Error(result.error.message);
      if ("output" in result && result.output !== undefined) setStreaming(outputText(result.output));
    }
    if (event.type === "error") throw new Error(event.error);
  };

  const execute = async (url: string, body: unknown) => {
    setBusy(true);
    setError(undefined);
    setStreaming("");
    let sessionId = detail?.sessionId;
    try {
      const response = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      await consumeStream(response, (event) => {
        if (event.type === "session") sessionId = event.sessionId;
        handleEnvelope(event);
      });
      if (sessionId) await openSession(sessionId);
      await refreshSessions();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Execution failed.");
    } finally {
      setBusy(false);
      setStreaming("");
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = prompt.trim();
    if (!value || busy) return;
    setPrompt("");
    void execute("/api/executions", { prompt: value, sessionId: detail?.sessionId });
  };

  const startNew = () => {
    setDetail(undefined); setStreaming(""); setError(undefined); setPrompt(""); setSidebarOpen(false);
    window.history.replaceState(null, "", "/");
  };

  const pending = detail?.pendingClientActions?.[0];
  return (
    <main className="workspace">
      <aside className="sidebar" data-open={sidebarOpen || undefined} data-collapsed={sidebarCollapsed || undefined}>
        <div className="brand">
          <button onClick={startNew} aria-label={`${appConfig.name} home`}><span><SunMedium /></span><div><strong>{appConfig.name}</strong><small>{appConfig.agentLabel}</small></div></button>
          <button className="icon-button mobile-only" onClick={() => setSidebarOpen(false)} aria-label="Close navigation"><X /></button>
        </div>
        <button className="new-session" onClick={startNew}><Plus /> <span>New execution</span></button>
        <nav aria-label="Sessions">
          <p className="eyebrow">Sessions</p>
          {sessions.length ? sessions.map((session) => (
            <button key={session.sessionId} data-active={detail?.sessionId === session.sessionId || undefined} onClick={() => void openSession(session.sessionId)}>
              <MessageSquare /><span><strong>{session.name || "Untitled execution"}</strong><small>{relativeTime(session.updatedAt)}</small></span>
            </button>
          )) : <p className="muted">Your durable sessions will appear here.</p>}
        </nav>
        <footer><ThemeSelector /><a href="https://github.com/Amarsia/orcha" target="_blank" rel="noreferrer">OrchaJS</a></footer>
      </aside>
      {sidebarOpen ? <button className="backdrop" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} /> : null}

      <section className="execution-panel">
        <header className="topbar">
          <button className="icon-button mobile-only" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><Menu /></button>
          <button className="icon-button desktop-only" onClick={() => setSidebarCollapsed((value) => !value)} aria-label="Toggle sidebar"><PanelLeftClose /></button>
          <div><strong>{detail?.name || "New execution"}</strong><small><UsageLine usage={detail?.usage} /></small></div>
          {detail ? <StatusPill status={detail.status} runStatus={detail.runStatus} /> : <span className="status-pill"><i /> Ready</span>}
          <button className="inspector-button" onClick={() => setInspectorOpen((value) => !value)} aria-expanded={inspectorOpen}><Activity /> <span>Trace</span></button>
        </header>
        <div className="content-row">
          <div className="run-column">
            <div className="run-scroll" onClick={(event) => {
              const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-prompt]");
              if (button?.dataset.prompt) setPrompt(button.dataset.prompt);
            }}>
              {loading ? <div className="loading-state"><span /><span /><span /></div> : <Timeline detail={detail} streaming={streaming} />}
              {pending ? (
                pending.name === "request_approval" ? (
                  <ApprovalCard call={pending} disabled={busy} onResolve={(output) => void execute(`/api/sessions/${detail?.sessionId}/tools/${pending.callId}`, { output })} />
                ) : (
                  <section className="unsupported-card"><AlertCircle /><div><strong>Client action required</strong><p>This template does not render “{pending.name}”. Add a typed resolver before advertising it as a capability.</p></div></section>
                )
              ) : null}
              <div ref={endRef} />
            </div>
            <div className="composer-region">
              {error ? <div className="error-banner" role="alert"><AlertCircle />{error}</div> : null}
              <form className="composer" onSubmit={submit}>
                <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={detail ? "Continue this execution…" : "What should the agent work on?"} maxLength={20_000} rows={1} disabled={busy || Boolean(pending)} aria-label="Agent prompt" onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
                }} />
                <button type="submit" disabled={!prompt.trim() || busy || Boolean(pending)} aria-label="Send prompt">{busy ? <Clock3 /> : <Send />}</button>
              </form>
              <p>Agent output may be inaccurate. Review actions and important decisions.</p>
            </div>
          </div>
          <aside className="inspector" data-open={inspectorOpen || undefined}>
            <div><div><p className="eyebrow">Execution trace</p><strong>{detail?.events.length ?? 0} events</strong></div><button className="icon-button" onClick={() => setInspectorOpen(false)} aria-label="Close trace"><X /></button></div>
            <EventInspector events={detail?.events ?? []} />
          </aside>
        </div>
      </section>
    </main>
  );
}
