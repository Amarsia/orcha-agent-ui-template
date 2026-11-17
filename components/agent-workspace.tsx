"use client";

import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  GitBranch,
  History,
  Loader2,
  Menu,
  Paperclip,
  PanelLeftClose,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import {
  ChangeEvent,
  FormEvent,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { RichMarkdown } from "@/components/rich-markdown";
import { ThemeSelector } from "@/components/theme-selector";
import { appConfig } from "@/config/app";
import type {
  ClientToolCall,
  RunResult,
  SessionDetail,
  SessionEvent,
  SessionSnapshot,
  StreamEnvelope,
  Usage,
} from "@/lib/types";
import { textContent } from "@/lib/types";

type ListResponse = { items?: SessionSnapshot[]; error?: string };
type ApiError = { error?: string };
type MessageAttachment = { name: string; mimeType: string; url?: string };
type PendingAttachment = MessageAttachment & {
  localId: string;
  id?: string;
  previewUrl?: string;
  uploading: boolean;
  error?: string;
};

type SubagentTab = {
  id: string;
  childSessionId: string;
  agent: string;
};

type SubagentSessionData = {
  sessionId: string;
  agent: string;
  status: string;
  events: SessionEvent[];
};

type TimelineStep =
  | {
      kind: "message";
      id: string;
      role: "user" | "assistant";
      author?: string;
      text: string;
      timestamp: string;
      attachments: MessageAttachment[];
    }
  | {
      kind: "activity";
      id: string;
      category: "action" | "client_action" | "reasoning" | "subagent" | "skill" | "evaluation";
      name: string;
      status?: string;
      timestamp: string;
      durationMs?: number;
      input?: unknown;
      output?: unknown;
      text?: string;
      childSessionId?: string;
      metrics?: Array<{ name: string; score: number; passed: boolean }>;
    };

function messageAttachments(content: unknown): MessageAttachment[] {
  if (!Array.isArray(content)) return [];
  return content.flatMap((rawPart) => {
    if (!rawPart || typeof rawPart !== "object") return [];
    const part = rawPart as Record<string, unknown>;
    if (part.type !== "file" || typeof part.filePath !== "string") return [];
    const segments = part.filePath.split(/[\\/]/);
    const base = segments.at(-1) || "Attachment";
    const idMatch = base.match(/^([a-zA-Z0-9_-]{32})-(.+)$/);
    const name = idMatch ? idMatch[2] : base;
    const url = idMatch ? `/api/uploads/${encodeURIComponent(idMatch[1])}` : undefined;
    return [{
      name,
      mimeType:
        typeof part.mimeType === "string" ? part.mimeType : "application/octet-stream",
      url,
    }];
  });
}

function relativeTime(value: string) {
  const delta = Math.max(0, Date.now() - Date.parse(value));
  if (delta < 60_000) return "now";
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDay(timestamp: string) {
  const date = new Date(timestamp);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function outputText(value: unknown) {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  return JSON.stringify(value, null, 2);
}

function sessionTone(session: Pick<SessionSnapshot, "status" | "runStatus">) {
  if (session.runStatus === "running" || session.runStatus === "waiting_for_subagent") {
    return "running";
  }
  if (session.runStatus === "waiting_for_client_action") return "waiting";
  if (session.runStatus === "failed") return "failed";
  return session.status === "completed" ? "completed" : "idle";
}

function buildStepsFromEvents(
  events: SessionEvent[],
  assistantAuthor: string,
): TimelineStep[] {
  const steps: TimelineStep[] = [];
  const actionByCallId = new Map<string, Extract<TimelineStep, { kind: "activity" }>>();
  const subagentByCallId = new Map<string, Extract<TimelineStep, { kind: "activity" }>>();
  const toolCallArgsByCallId = new Map<string, Record<string, unknown>>();

  for (const event of events) {
    const data = (event.data ?? {}) as Record<string, unknown>;

    if (event.type === "message.created") {
      const role = data.role;
      if (role === "user") {
        const text = textContent(data.content);
        const attachments = messageAttachments(data.content);
        if (text || attachments.length > 0) {
          steps.push({
            kind: "message",
            id: `msg-${event.sequence}`,
            role: "user",
            text,
            timestamp: event.timestamp,
            attachments,
          });
        }
      } else if (role === "assistant") {
        const content = Array.isArray(data.content)
          ? (data.content as Array<{
              type?: string;
              text?: string;
              callId?: string;
              arguments?: Record<string, unknown>;
            }>)
          : [];
        for (const item of content) {
          if (item.type === "tool_call" && item.callId && item.arguments) {
            toolCallArgsByCallId.set(item.callId, item.arguments);
          }
        }
        const reasoningText = content
          .filter((c) => c.type === "reasoning" && typeof c.text === "string" && c.text.trim())
          .map((c) => c.text!.trim())
          .join("\n\n");
        if (reasoningText) {
          steps.push({
            kind: "activity",
            id: `reason-${event.sequence}`,
            category: "reasoning",
            name: "Thought",
            status: "completed",
            timestamp: event.timestamp,
            text: reasoningText,
          });
        }
        const assistantText = content
          .filter((c) => c.type === "text" && typeof c.text === "string")
          .map((c) => c.text!)
          .join("");
        if (assistantText.trim()) {
          steps.push({
            kind: "message",
            id: `msg-${event.sequence}`,
            role: "assistant",
            author: assistantAuthor,
            text: assistantText,
            timestamp: event.timestamp,
            attachments: messageAttachments(data.content),
          });
        }
      }
      continue;
    }

    if (event.type === "action.requested") {
      const callId = String(data.callId ?? event.sequence);
      const step: Extract<TimelineStep, { kind: "activity" }> = {
        kind: "activity",
        id: `act-${callId}`,
        category: "action",
        name: String(data.name ?? "action"),
        status: "running",
        timestamp: event.timestamp,
        input: data.arguments,
      };
      actionByCallId.set(callId, step);
      steps.push(step);
      continue;
    }

    if (event.type === "action.completed" || event.type === "action.failed") {
      const callId = String(data.callId ?? "");
      const existing = actionByCallId.get(callId);
      const nextStatus = event.type === "action.completed" ? "completed" : "failed";
      const output = event.type === "action.completed" ? data.output : data.error;
      if (existing) {
        existing.status = nextStatus;
        existing.durationMs = typeof data.durationMs === "number" ? data.durationMs : undefined;
        existing.output = output;
      } else {
        steps.push({
          kind: "activity",
          id: `act-${event.sequence}`,
          category: "action",
          name: String(data.name ?? "action"),
          status: nextStatus,
          timestamp: event.timestamp,
          durationMs: typeof data.durationMs === "number" ? data.durationMs : undefined,
          output,
        });
      }
      continue;
    }

    if (event.type === "client_action.requested") {
      const calls = Array.isArray(data.calls)
        ? (data.calls as Array<{ callId?: string; name?: string; arguments?: unknown }>)
        : [];
      for (const call of calls) {
        const callId = String(call.callId ?? event.sequence);
        const step: Extract<TimelineStep, { kind: "activity" }> = {
          kind: "activity",
          id: `cli-${callId}`,
          category: "client_action",
          name: String(call.name ?? "client_action"),
          status: "waiting",
          timestamp: event.timestamp,
          input: call.arguments,
        };
        actionByCallId.set(callId, step);
        steps.push(step);
      }
      continue;
    }

    if (event.type === "client_action.resolved") {
      const results = Array.isArray(data.results)
        ? (data.results as Array<{ callId?: string; output?: unknown; isError?: boolean }>)
        : [];
      for (const res of results) {
        const existing = actionByCallId.get(String(res.callId ?? ""));
        if (existing) {
          existing.status = res.isError ? "failed" : "completed";
          existing.output = res.output;
        }
      }
      continue;
    }

    if (event.type === "skill.loaded") {
      steps.push({
        kind: "activity",
        id: `skill-${event.sequence}`,
        category: "skill",
        name: String(data.name ?? "skill"),
        status: data.alreadyLoaded ? "already loaded" : "loaded",
        timestamp: event.timestamp,
      });
      continue;
    }

    if (event.type === "subagent.initiated") {
      const callId = String(data.callId ?? event.sequence);
      const childSessionId = typeof data.sessionId === "string" ? data.sessionId : undefined;
      const step: Extract<TimelineStep, { kind: "activity" }> = {
        kind: "activity",
        id: `sub-${callId}`,
        category: "subagent",
        name: String(data.agent ?? "subagent"),
        status: "running",
        timestamp: event.timestamp,
        childSessionId,
        input: toolCallArgsByCallId.get(callId),
      };
      subagentByCallId.set(callId, step);
      steps.push(step);
      continue;
    }

    if (
      event.type === "subagent.completed" ||
      event.type === "subagent.paused" ||
      event.type === "subagent.failed"
    ) {
      const callId = String(data.callId ?? "");
      const childSessionId = typeof data.sessionId === "string" ? data.sessionId : undefined;
      const existing = subagentByCallId.get(callId);
      const status = String(data.status ?? event.type.replace("subagent.", ""));
      if (existing) {
        existing.status = status;
        existing.output = data.output ?? data.error;
        if (!existing.childSessionId && childSessionId) existing.childSessionId = childSessionId;
      } else {
        steps.push({
          kind: "activity",
          id: `sub-${event.sequence}`,
          category: "subagent",
          name: String(data.agent ?? "subagent"),
          status,
          timestamp: event.timestamp,
          childSessionId,
          output: data.output ?? data.error,
        });
      }
      continue;
    }

    if (event.type === "evaluation.completed" || event.type === "evaluation.failed") {
      const metrics = Array.isArray(data.metrics)
        ? (data.metrics as Array<{ name: string; score: number; passed: boolean }>)
        : undefined;
      steps.push({
        kind: "activity",
        id: `eval-${event.sequence}`,
        category: "evaluation",
        name: String(data.name ?? "evaluation"),
        status: String(data.status ?? "completed"),
        timestamp: event.timestamp,
        durationMs: typeof data.durationMs === "number" ? data.durationMs : undefined,
        metrics,
      });
    }
  }

  return steps;
}

function buildTimeline(detail?: SessionDetail): TimelineStep[] {
  if (!detail) return [];
  const events = detail.events ?? [];
  if (!events.length) {
    return (detail.history ?? []).map((item) => {
      if (item.type === "message") {
        return {
          kind: "message",
          id: item.id,
          role: item.role === "user" ? "user" : "assistant",
          author: appConfig.name,
          text: textContent(item.content),
          timestamp: item.createdAt,
          attachments: messageAttachments(item.content),
        };
      }
      return {
        kind: "activity",
        id: item.id,
        category: item.type === "session_completed" ? "action" : item.type,
        name: item.name || item.type,
        status: item.status,
        timestamp: item.createdAt,
        input: item.arguments,
        metrics: item.metrics?.map((m) => ({ name: m.name, score: m.score, passed: m.passed })),
      };
    });
  }
  return buildStepsFromEvents(events, appConfig.name);
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

function StatusPill({
  status,
  runStatus,
  busy,
}: {
  status?: SessionSnapshot["status"];
  runStatus?: SessionSnapshot["runStatus"];
  busy: boolean;
}) {
  if (busy || runStatus === "running" || runStatus === "waiting_for_subagent") {
    return (
      <span className="status-pill" data-tone="active">
        <Loader2 className="spin" /> Running
      </span>
    );
  }
  if (runStatus === "waiting_for_client_action") {
    return (
      <span className="status-pill" data-tone="waiting">
        <Clock /> Input needed
      </span>
    );
  }
  if (runStatus === "failed") {
    return (
      <span className="status-pill" data-tone="failed">
        <AlertCircle /> Failed
      </span>
    );
  }
  if (status === "completed") {
    return (
      <span className="status-pill" data-tone="completed">
        <CheckCircle2 /> Completed
      </span>
    );
  }
  return null;
}

function UsageChip({ usage }: { usage?: Usage }) {
  if (!usage) return null;
  return (
    <span className="usage-chip">
      {usage.inputTokens.toLocaleString()} in · {usage.outputTokens.toLocaleString()} out
    </span>
  );
}

function StepIcon({ category }: { category: Extract<TimelineStep, { kind: "activity" }>["category"] }) {
  if (category === "subagent") return <GitBranch />;
  if (category === "reasoning") return <Sparkles />;
  if (category === "skill") return <BookOpen />;
  if (category === "client_action") return <ShieldCheck />;
  if (category === "evaluation") return <CheckCircle2 />;
  return <Wrench />;
}

function stepLabel(step: Extract<TimelineStep, { kind: "activity" }>) {
  if (step.category === "subagent") return `Subagent · ${step.name}`;
  if (step.category === "reasoning") return "Thought";
  if (step.category === "skill") return `Skill · ${step.name}`;
  if (step.category === "client_action") return `Client action · ${step.name.replaceAll("_", " ")}`;
  if (step.category === "evaluation") return `Evaluation · ${step.name}`;
  return `Tool · ${step.name.replaceAll("_", " ")}`;
}

function statusTone(status?: string) {
  if (status === "failed" || status === "error") return "failed";
  if (status === "completed" || status === "passed" || status === "loaded") return "completed";
  return undefined;
}

function StepRow({
  step,
  onOpenSubagent,
}: {
  step: Extract<TimelineStep, { kind: "activity" }>;
  onOpenSubagent?: (childSessionId: string, agent: string) => void;
}) {
  if (step.category === "subagent" && step.childSessionId && onOpenSubagent) {
    return (
      <div className="step-row">
        <button
          type="button"
          className="step-line"
          onClick={() => onOpenSubagent(step.childSessionId!, step.name)}
        >
          <StepIcon category="subagent" />
          <span className="step-name">{stepLabel(step)}</span>
          {step.status ? (
            <span className="step-status" data-tone={statusTone(step.status)}>
              {step.status === "running" ? "running" : step.status}
            </span>
          ) : null}
          <span className="step-meta">
            <time dateTime={step.timestamp}>{formatTime(step.timestamp)}</time>
            <ArrowUpRight />
          </span>
        </button>
      </div>
    );
  }

  const hasDetails =
    step.input !== undefined ||
    step.output !== undefined ||
    Boolean(step.text) ||
    Boolean(step.metrics?.length);

  return (
    <div className="step-row">
      <details className="step-details">
        <summary className="step-line" data-static={!hasDetails || undefined}>
          <StepIcon category={step.category} />
          <span className="step-name">{stepLabel(step)}</span>
          {step.status ? (
            <span className="step-status" data-tone={statusTone(step.status)}>
              {step.status}
            </span>
          ) : null}
          <span className="step-meta">
            {step.durationMs !== undefined ? <span>{step.durationMs}ms</span> : null}
            <time dateTime={step.timestamp}>{formatTime(step.timestamp)}</time>
          </span>
        </summary>
        {hasDetails ? (
          <div className="step-drawer">
            {step.text ? (
              step.category === "reasoning" ? (
                <div className="step-thought">
                  <RichMarkdown>{step.text}</RichMarkdown>
                </div>
              ) : (
                <pre>{step.text}</pre>
              )
            ) : null}
            {step.input !== undefined ? (
              <>
                <div className="step-drawer-label">Input</div>
                <pre>{JSON.stringify(step.input, null, 2)}</pre>
              </>
            ) : null}
            {step.output !== undefined ? (
              <>
                <div className="step-drawer-label">Output</div>
                <pre>
                  {typeof step.output === "string"
                    ? step.output
                    : JSON.stringify(step.output, null, 2)}
                </pre>
              </>
            ) : null}
            {step.metrics?.length ? (
              <div className="metrics-inline">
                {step.metrics.map((m) => (
                  <span key={m.name}>
                    {m.name}: {Math.round(m.score * 100)}%
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </details>
    </div>
  );
}

function AttachmentList({ attachments }: { attachments: MessageAttachment[] }) {
  if (!attachments.length) return null;
  const images = attachments.filter((a) => a.mimeType.startsWith("image/") && a.url);
  const files = attachments.filter((a) => !(a.mimeType.startsWith("image/") && a.url));
  return (
    <>
      {images.length ? (
        <div className="message-images">
          {images.map((attachment, index) => (
            <a
              key={`${attachment.name}-${index}`}
              href={attachment.url}
              target="_blank"
              rel="noreferrer"
              className="message-image-link"
              title={attachment.name}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={attachment.url} alt={attachment.name} />
            </a>
          ))}
        </div>
      ) : null}
      {files.length ? (
        <div className="message-files">
          {files.map((attachment, index) => (
            attachment.url ? (
              <a
                key={`${attachment.name}-${index}`}
                href={attachment.url}
                target="_blank"
                rel="noreferrer"
                className="message-file-chip"
              >
                <FileText />
                {attachment.name}
              </a>
            ) : (
              <span key={`${attachment.name}-${index}`} className="message-file-chip">
                <FileText />
                {attachment.name}
              </span>
            )
          ))}
        </div>
      ) : null}
    </>
  );
}

function ApprovalCard({
  call,
  disabled,
  onResolve,
}: {
  call: ClientToolCall;
  disabled: boolean;
  onResolve: (output: Record<string, unknown>) => void;
}) {
  const args = call.arguments as { title?: unknown; summary?: unknown };
  const [note, setNote] = useState("");
  return (
    <section className="approval-card" aria-labelledby={`approval-${call.callId}`}>
      <div className="card-icon">
        <Check />
      </div>
      <div>
        <p className="eyebrow">Client action required</p>
        <h3 id={`approval-${call.callId}`}>
          {typeof args.title === "string" ? args.title : "Approve this step?"}
        </h3>
        {typeof args.summary === "string" ? <p>{args.summary}</p> : null}
        <label className="approval-note">
          <span>Decision note</span>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional context returned to the agent"
            disabled={disabled}
          />
        </label>
        <div className="approval-actions">
          <button
            type="button"
            className="primary-btn"
            disabled={disabled}
            onClick={() => onResolve({ approved: true, note: note.trim() || undefined })}
          >
            Approve and continue
          </button>
          <button
            type="button"
            className="ghost-btn"
            disabled={disabled}
            onClick={() => onResolve({ approved: false, note: note.trim() || undefined })}
          >
            Decline
          </button>
        </div>
      </div>
    </section>
  );
}

function Timeline({
  steps,
  streaming,
  streamingAuthor,
  emptyLabel,
  onSelectPrompt,
  onOpenSubagent,
}: {
  steps: TimelineStep[];
  streaming?: string;
  streamingAuthor?: string;
  emptyLabel?: string;
  onSelectPrompt?: (prompt: string) => void;
  onOpenSubagent?: (childSessionId: string, agent: string) => void;
}) {
  if (!steps.length && !streaming) {
    if (emptyLabel) {
      return (
        <div className="empty-state">
          <p>{emptyLabel}</p>
        </div>
      );
    }
    return (
      <div className="empty-state">
        <div className="empty-mark">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={appConfig.icon} alt={appConfig.name} />
        </div>
        <h1>{appConfig.name}</h1>
        <p>{appConfig.description}</p>
        {onSelectPrompt ? (
          <div className="prompt-grid">
            {appConfig.suggestedPrompts.map((item) => (
              <button
                key={item.title}
                type="button"
                className="prompt-card"
                onClick={() => onSelectPrompt(item.prompt)}
              >
                <strong>{item.title}</strong>
                <span>{item.prompt}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="timeline" aria-live="polite" aria-busy={Boolean(streaming)}>
      {steps.map((step, index) => {
        const day = formatDay(step.timestamp);
        const showDay = index === 0 || day !== formatDay(steps[index - 1].timestamp);

        return (
          <Fragment key={step.id}>
            {showDay ? (
              <div className="day-divider">
                <span>{day}</span>
              </div>
            ) : null}
            {step.kind === "message" ? (
              <article className="message-entry" data-role={step.role}>
                <div className="message-heading">
                  <strong>{step.role === "user" ? "You" : step.author || appConfig.name}</strong>
                  <time dateTime={step.timestamp}>{formatTime(step.timestamp)}</time>
                </div>
                <AttachmentList attachments={step.attachments} />
                {step.text ? (
                  <div className="message-content">
                    {step.role === "assistant" ? (
                      <RichMarkdown>{step.text}</RichMarkdown>
                    ) : <p>{step.text}</p>}
                  </div>
                ) : null}
              </article>
            ) : (
              <StepRow step={step} onOpenSubagent={onOpenSubagent} />
            )}
          </Fragment>
        );
      })}

      {streaming ? (
        <article className="message-entry" data-role="assistant">
          <div className="message-heading">
            <strong>{streamingAuthor || appConfig.name}</strong>
            <span>working</span>
          </div>
          <div className="message-content">
            <RichMarkdown>{streaming}</RichMarkdown>
            <i className="streaming-cursor" />
          </div>
        </article>
      ) : null}
    </div>
  );
}

function ActiveRunState({
  busy,
  streaming,
  detail,
}: {
  busy: boolean;
  streaming: string;
  detail?: SessionDetail;
}) {
  if (!busy) return null;
  const events = detail?.events ?? [];
  const last = events.at(-1);
  const data = (last?.data ?? {}) as Record<string, unknown>;
  let label = streaming ? "Writing response" : "Thinking";

  if (last?.type === "action.requested") {
    label = `Running ${String(data.name ?? "action").replaceAll("_", " ")}`;
  } else if (last?.type === "subagent.initiated") {
    label = `${String(data.agent ?? "subagent")} is working`;
  } else if (last?.type === "client_action.requested") {
    label = "Waiting for approval";
  }

  return (
    <div className="active-run-state" aria-live="polite">
      <Loader2 className="spin" />
      <span>{label}</span>
      <i />
      <i />
      <i />
    </div>
  );
}

export function AgentWorkspace() {
  const [sessions, setSessions] = useState<SessionSnapshot[]>([]);
  const [detail, setDetail] = useState<SessionDetail>();
  const [subagentTabs, setSubagentTabs] = useState<SubagentTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>("main");
  const [subagentData, setSubagentData] = useState<Record<string, SubagentSessionData>>({});
  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [streaming, setStreaming] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [runningSessionId, setRunningSessionId] = useState<string>();
  const [error, setError] = useState<string>();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const refreshSessions = useCallback(async () => {
    const response = await fetch("/api/sessions?pageSize=40", { cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as ListResponse;
    if (!response.ok) throw new Error(data.error || "Sessions could not be loaded.");
    setSessions(data.items ?? []);
  }, []);

  const openSession = useCallback(async (sessionId: string) => {
    setLoading(true);
    setError(undefined);
    setSidebarOpen(false);
    setSubagentTabs([]);
    setActiveTabId("main");
    setSubagentData({});
    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
        cache: "no-store",
      });
      const data = (await response.json().catch(() => ({}))) as SessionDetail & ApiError;
      if (!response.ok) throw new Error(data.error || "Session could not be loaded.");
      setDetail(data);
      window.history.replaceState(null, "", `/?session=${encodeURIComponent(sessionId)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Session could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSubagent = useCallback(async (parentSessionId: string, childSessionId: string) => {
    const response = await fetch(
      `/api/sessions/${encodeURIComponent(parentSessionId)}/subagents/${encodeURIComponent(childSessionId)}`,
      { cache: "no-store" },
    ).catch(() => undefined);
    if (!response?.ok) return;
    const data = (await response.json()) as SubagentSessionData;
    setSubagentData((current) => ({ ...current, [childSessionId]: data }));
  }, []);

  const openSubagentTab = useCallback(
    (childSessionId: string, agent: string) => {
      if (!detail?.sessionId) return;
      setSubagentTabs((current) =>
        current.some((tab) => tab.childSessionId === childSessionId)
          ? current
          : [...current, { id: childSessionId, childSessionId, agent }],
      );
      setActiveTabId(childSessionId);
      void loadSubagent(detail.sessionId, childSessionId);
    },
    [detail?.sessionId, loadSubagent],
  );

  const closeSubagentTab = useCallback((tabId: string) => {
    setSubagentTabs((current) => current.filter((tab) => tab.id !== tabId));
    setActiveTabId((current) => (current === tabId ? "main" : current));
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

  useEffect(() => {
    if (activeTabId !== "main") {
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
      return;
    }
    endRef.current?.scrollIntoView({ behavior: busy ? "smooth" : "auto" });
  }, [busy, detail, streaming, activeTabId]);

  useEffect(() => {
    if (!busy || !runningSessionId) return;
    let stopped = false;
    const refreshActiveRun = async () => {
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(runningSessionId)}`,
        { cache: "no-store" },
      ).catch(() => undefined);
      if (!response?.ok || stopped) return;
      const nextDetail = (await response.json()) as SessionDetail;
      if (!stopped) setDetail(nextDetail);
    };
    void refreshActiveRun();
    const interval = window.setInterval(() => void refreshActiveRun(), 700);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [busy, runningSessionId]);

  useEffect(() => {
    if (!busy || !detail?.sessionId || activeTabId === "main") return;
    const interval = window.setInterval(() => {
      void loadSubagent(detail.sessionId, activeTabId);
    }, 700);
    return () => window.clearInterval(interval);
  }, [activeTabId, busy, detail?.sessionId, loadSubagent]);

  const handleEnvelope = (event: StreamEnvelope) => {
    if (event.type === "session") {
      setRunningSessionId(event.sessionId);
      window.history.replaceState(null, "", `/?session=${encodeURIComponent(event.sessionId)}`);
      setDetail((current) => (current ? { ...current, sessionId: event.sessionId } : current));
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

  const execute = async (url: string, body: unknown, isNewSession = false) => {
    setBusy(true);
    setError(undefined);
    setStreaming("");
    if (isNewSession) {
      setDetail(undefined);
      setSubagentTabs([]);
      setActiveTabId("main");
      setSubagentData({});
    }
    let sessionId = isNewSession ? undefined : detail?.sessionId;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
      setRunningSessionId(undefined);
      setStreaming("");
    }
  };

  const selectFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).slice(
      0,
      Math.max(0, appConfig.maxFilesPerRun - attachments.length),
    );
    event.target.value = "";

    for (const file of files) {
      const localId = crypto.randomUUID();
      const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
      setAttachments((current) => [
        ...current,
        {
          localId,
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          previewUrl,
          uploading: true,
        },
      ]);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch("/api/uploads", { method: "POST", body: formData });
        const uploaded = (await response.json().catch(() => ({}))) as {
          id?: string;
          name?: string;
          mimeType?: string;
          error?: string;
        };
        if (!response.ok || !uploaded.id) {
          throw new Error(uploaded.error || "Upload failed.");
        }
        setAttachments((current) =>
          current.map((item) =>
            item.localId === localId
              ? {
                  ...item,
                  id: uploaded.id,
                  name: uploaded.name || item.name,
                  mimeType: uploaded.mimeType || item.mimeType,
                  url: `/api/uploads/${encodeURIComponent(uploaded.id!)}`,
                  uploading: false,
                }
              : item,
          ),
        );
      } catch (cause) {
        setAttachments((current) =>
          current.map((item) =>
            item.localId === localId
              ? {
                  ...item,
                  uploading: false,
                  error: cause instanceof Error ? cause.message : "Upload failed.",
                }
              : item,
          ),
        );
      }
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = prompt.trim();
    const uploadedIds = attachments.flatMap((item) => (item.id ? [item.id] : []));
    if (
      busy ||
      (!value && uploadedIds.length === 0) ||
      attachments.some((item) => item.uploading || item.error)
    ) {
      return;
    }
    setPrompt("");
    setAttachments([]);
    setActiveTabId("main");
    void execute("/api/executions", {
      prompt: value,
      sessionId: detail?.sessionId,
      attachments: uploadedIds,
    });
  };

  const startNew = () => {
    setDetail(undefined);
    setSubagentTabs([]);
    setActiveTabId("main");
    setSubagentData({});
    setStreaming("");
    setError(undefined);
    setPrompt("");
    setAttachments([]);
    setSidebarOpen(false);
    window.history.replaceState(null, "", "/");
  };

  const mainSteps = useMemo(() => buildTimeline(detail), [detail]);

  const unpersistedStreaming = useMemo(() => {
    if (!streaming) return "";
    const lastAssistantText = [...mainSteps]
      .reverse()
      .find((step) => step.kind === "message" && step.role === "assistant")?.text;
    if (!lastAssistantText) return streaming;
    if (streaming === lastAssistantText) return "";
    if (streaming.startsWith(lastAssistantText)) {
      return streaming.slice(lastAssistantText.length).trimStart();
    }
    return streaming;
  }, [mainSteps, streaming]);

  const activeSubagentTab = subagentTabs.find((tab) => tab.id === activeTabId);
  const activeSubagent = activeSubagentTab
    ? subagentData[activeSubagentTab.childSessionId]
    : undefined;
  const subagentSteps = useMemo(
    () =>
      activeSubagent && activeSubagentTab
        ? buildStepsFromEvents(activeSubagent.events, activeSubagentTab.agent)
        : [],
    [activeSubagent, activeSubagentTab],
  );

  const pending = detail?.pendingClientActions?.[0];
  const headerSubtitle = busy
    ? unpersistedStreaming
      ? "Writing response"
      : "Thinking"
    : pending
      ? "Waiting for input"
      : detail?.status === "completed"
        ? "Completed"
        : appConfig.agentLabel;

  return (
    <main className="workspace">
      <aside
        className="sidebar"
        data-open={sidebarOpen || undefined}
        data-collapsed={sidebarCollapsed || undefined}
      >
        <div className="brand">
          <button type="button" className="brand-home" onClick={startNew}>
            <span className="brand-mark">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={appConfig.icon} alt={appConfig.name} />
            </span>
            <span className="brand-text">
              <strong>{appConfig.name}</strong>
              <small>{appConfig.agentLabel}</small>
            </span>
          </button>
          <button
            type="button"
            className="icon-button mobile-only"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation"
          >
            <X />
          </button>
        </div>

        <div className="sidebar-controls">
          <span className="sidebar-title"><History /> History</span>
          <button
            type="button"
            className="new-run-btn"
            onClick={startNew}
            title="New run"
            aria-label="New run"
          >
            <Plus />
          </button>
        </div>

        <div className="sidebar-scroll">
          <nav aria-label="Runs" className="session-list">
            {sessions.length ? sessions.map((session) => (
              <button
                key={session.sessionId}
                type="button"
                className="session-row"
                data-active={detail?.sessionId === session.sessionId || undefined}
                onClick={() => void openSession(session.sessionId)}
              >
                <i className="status-dot" data-tone={sessionTone(session)} />
                <span className="session-meta">
                  <strong>{session.name || "Untitled run"}</strong>
                  <span className="session-sub">{relativeTime(session.updatedAt)}</span>
                </span>
              </button>
            )) : <p className="muted-note">No runs yet. Enter instructions to start one.</p>}
          </nav>
        </div>

        <footer>
          <ThemeSelector />
          <a href="https://github.com/Amarsia/orcha" target="_blank" rel="noreferrer">
            OrchaJS
          </a>
        </footer>
      </aside>

      {sidebarOpen ? (
        <button
          type="button"
          className="backdrop"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <section className="execution-panel">
        <header className="topbar">
          <button
            type="button"
            className="icon-button mobile-only"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation"
          >
            <Menu />
          </button>
          <button
            type="button"
            className="icon-button desktop-only"
            onClick={() => setSidebarCollapsed((value) => !value)}
            aria-label="Toggle sidebar"
          >
            <PanelLeftClose />
          </button>

          <div className="topbar-title">
            <div>
              <strong>{detail?.name || appConfig.name}</strong>
              <small>{headerSubtitle}</small>
            </div>
          </div>

          <div className="topbar-actions">
            <UsageChip usage={detail?.usage} />
            <StatusPill status={detail?.status} runStatus={detail?.runStatus} busy={busy} />
          </div>
        </header>

        {activeSubagentTab ? (
          <div className="subagent-nav-bar">
            <button
              type="button"
              className="subagent-back-btn"
              onClick={() => closeSubagentTab(activeSubagentTab.id)}
            >
              <ArrowLeft />
              <span>Back to {appConfig.name}</span>
            </button>
            <span className="subagent-nav-sep" aria-hidden="true">/</span>
            <span className="subagent-nav-title">
              <GitBranch />
              <strong>{activeSubagentTab.agent}</strong>
              <span className="subagent-nav-id">
                {activeSubagent?.sessionId || activeSubagentTab.childSessionId}
              </span>
            </span>
            <span
              className="step-status subagent-nav-status"
              data-tone={statusTone(activeSubagent?.status)}
            >
              {activeSubagent?.status || "loading"}
            </span>
          </div>
        ) : null}

        <div className="content-row">
          <div className="run-column">
            <div className="run-scroll" ref={scrollRef}>
              {loading ? (
                <div className="loading-state">
                  <span />
                  <span />
                  <span />
                </div>
              ) : activeSubagentTab ? (
                <Timeline
                  steps={subagentSteps}
                  emptyLabel="Loading subagent transcript..."
                />
              ) : (
                <Timeline
                  steps={mainSteps}
                  streaming={unpersistedStreaming}
                  onSelectPrompt={(value) => setPrompt(value)}
                  onOpenSubagent={openSubagentTab}
                />
              )}

              {!activeSubagentTab && pending ? (
                pending.name === "request_approval" ? (
                  <ApprovalCard
                    call={pending}
                    disabled={busy}
                    onResolve={(output) =>
                      void execute(`/api/sessions/${detail?.sessionId}/tools/${pending.callId}`, {
                        output,
                      })
                    }
                  />
                ) : (
                  <section className="unsupported-card">
                    <AlertCircle />
                    <div>
                      <strong>Client action required</strong>
                      <p>No UI resolver is registered for “{pending.name}”.</p>
                    </div>
                  </section>
                )
              ) : null}
              {!activeSubagentTab ? (
                <ActiveRunState busy={busy} streaming={unpersistedStreaming} detail={detail} />
              ) : null}
              <div ref={endRef} />
            </div>

            {!activeSubagentTab ? (
              <div className="composer-region">
                {error ? (
                  <div className="error-banner" role="alert">
                    <AlertCircle />
                    <span>{error}</span>
                  </div>
                ) : null}
                {attachments.length ? (
                  <div className="pending-files">
                    {attachments.map((file) => (
                      <div key={file.localId} data-error={Boolean(file.error) || undefined}>
                        {file.mimeType.startsWith("image/") && (file.previewUrl || file.url) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={file.previewUrl || file.url}
                            alt={file.name}
                            className="pending-thumb"
                          />
                        ) : (
                          <FileText />
                        )}
                        <span title={file.error}>{file.name}</span>
                        {file.uploading ? <Loader2 className="spin" /> : null}
                        <button
                          type="button"
                          onClick={() => {
                            if (file.previewUrl) URL.revokeObjectURL(file.previewUrl);
                            setAttachments((current) =>
                              current.filter((item) => item.localId !== file.localId),
                            );
                          }}
                          disabled={file.uploading}
                          aria-label={`Remove ${file.name}`}
                        >
                          <X />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
                <form className="composer" onSubmit={submit}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    hidden
                    multiple
                    accept=".pdf,.txt,.md,.csv,.json,.doc,.docx,.xls,.xlsx,image/png,image/jpeg,image/gif,image/webp"
                    onChange={(event) => void selectFiles(event)}
                  />
                  <button
                    type="button"
                    className="attach-button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={
                      !appConfig.allowFileUploads ||
                      busy ||
                      Boolean(pending) ||
                      attachments.length >= appConfig.maxFilesPerRun
                    }
                    aria-label="Attach files"
                    title={`Attach up to ${appConfig.maxFilesPerRun} files`}
                  >
                    <Paperclip />
                  </button>
                  <textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder={
                      detail
                        ? "Send a follow-up instruction..."
                        : "Enter agent instructions to run on demand..."
                    }
                    maxLength={20_000}
                    rows={1}
                    disabled={busy || Boolean(pending)}
                    aria-label="Agent prompt"
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                  />
                  <button
                    type="submit"
                    className="send-button"
                    disabled={
                      busy ||
                      Boolean(pending) ||
                      (!prompt.trim() && attachments.length === 0) ||
                      attachments.some((item) => item.uploading || Boolean(item.error))
                    }
                    aria-label="Run agent"
                  >
                    {busy ? <Loader2 className="spin" /> : <Send />}
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
