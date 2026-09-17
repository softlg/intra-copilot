import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import Pagination from "../components/Pagination";
import { TruncatedId } from "../components/TruncatedId";
import {
  AuthAttachmentImage,
  downloadAuthAttachment,
} from "../components/AuthAttachmentImage";
import { toast } from "../components/Toast";
import { formatDateTime, formatFileSize } from "../lib/format";
import type { Translations } from "../i18n/translations";
import type {
  ConversationInvocation,
  ConversationInvocationEvent,
  ConversationInvocationNode,
  ConversationInvocationTrace,
  ConversationLog,
  ConversationLogSummary,
  ConversationPlan,
  ConversationPlanStep,
  ConversationTraceTree,
} from "../types";

export interface ConversationLogsPageProps {
  t: Translations;
  logs: ConversationLogSummary[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  sessionId: string;
  sessionIdDraft: string;
  onSessionIdDraftChange: (value: string) => void;
  onApplyFilter: () => void;
  onResetFilter: () => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onOpenLog: (id: string) => void;
  detail?: ConversationLog;
  detailOpen: boolean;
  detailLoading: boolean;
  onCloseDetail: () => void;
}

type ConversationMessage = ConversationLog["messages"][number];

type TimelineEntry =
  | {
      kind: "message";
      id: string;
      createdAt?: string;
      turn: number;
      message: ConversationMessage;
    }
  | {
      kind: "invocation";
      id: string;
      createdAt?: string;
      turn: number;
      invocation: ConversationInvocation;
      trace?: ConversationInvocationTrace;
    }
  | {
      kind: "plan";
      id: string;
      createdAt?: string;
      turn: number;
      plan: ConversationPlan;
    }
  | {
      kind: "trace";
      id: string;
      createdAt?: string;
      turn: number;
      trace: ConversationTraceTree;
    };

function timestamp(value?: string) {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function compareConversationEvents(
  left: ConversationInvocationEvent,
  right: ConversationInvocationEvent,
) {
  const leftSequence = left.sequence ?? Number.MAX_SAFE_INTEGER;
  const rightSequence = right.sequence ?? Number.MAX_SAFE_INTEGER;
  if (leftSequence !== rightSequence) return leftSequence - rightSequence;
  return (left.createdAt ?? "").localeCompare(right.createdAt ?? "");
}

function formatDuration(totalMs: number) {
  if (totalMs <= 0) return "-";
  if (totalMs < 1000) return `${totalMs} ms`;
  return `${(totalMs / 1000).toFixed(totalMs >= 10000 ? 0 : 1)} s`;
}

function formatJson(value: unknown) {
  if (value == null || value === "") return "-";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function planStatusLabel(status: string | undefined, t: Translations) {
  switch (status) {
    case "COMPLETED":
      return t.conversationPlanCompleted;
    case "RUNNING":
      return t.conversationPlanRunning;
    case "FAILED":
      return t.conversationPlanFailed;
    case "CANCELLED":
      return t.conversationPlanCancelled;
    case "SUPERSEDED":
      return t.conversationPlanSuperseded;
    case "SKIPPED":
      return t.conversationPlanSkipped;
    default:
      return t.conversationPlanPending;
  }
}

function buildTimeline(detail?: ConversationLog): TimelineEntry[] {
  if (!detail) return [];
  const userMessageTimes = detail.messages
    .filter((message) => message.role === "user")
    .map((message) => timestamp(message.createdAt))
    .filter(Number.isFinite);
  let currentTurn = 0;
  const messageEntries: TimelineEntry[] = detail.messages.map((message) => {
    if (message.role === "user") currentTurn += 1;
    return {
      kind: "message",
      id: message.id,
      createdAt: message.createdAt,
      turn: Math.max(1, currentTurn),
      message,
    };
  });
  const traceEntries: TimelineEntry[] = (detail.traces ?? []).map((trace) => {
    const traceTime = timestamp(trace.startedAt);
    const turn = Number.isFinite(traceTime)
      ? Math.max(
          1,
          userMessageTimes.filter((messageTime) => messageTime <= traceTime)
            .length,
        )
      : Math.max(1, currentTurn);
    return {
      kind: "trace",
      id: trace.traceId,
      createdAt: trace.startedAt,
      turn,
      trace,
    };
  });
  const invocationEntries: TimelineEntry[] =
    traceEntries.length > 0
      ? []
      : detail.invocations.map((invocation) => {
          const invocationTime = timestamp(invocation.createdAt);
          const turn = Number.isFinite(invocationTime)
            ? Math.max(
                1,
                userMessageTimes.filter(
                  (messageTime) => messageTime <= invocationTime,
                ).length,
              )
            : Math.max(1, currentTurn);
          return {
            kind: "invocation",
            id: invocation.id,
            createdAt: invocation.createdAt,
            turn,
            invocation,
            trace: detail.invocationTraces?.find(
              (trace) => trace.invocation.id === invocation.id,
            ),
          };
        });
  const planEntries: TimelineEntry[] = (detail.plans ?? []).map((plan) => {
    const planTime = timestamp(plan.plan.createdAt);
    const turn = Number.isFinite(planTime)
      ? Math.max(
          1,
          userMessageTimes.filter((messageTime) => messageTime <= planTime)
            .length,
        )
      : Math.max(1, currentTurn);
    return {
      kind: "plan",
      id: plan.plan.id,
      createdAt: plan.plan.createdAt,
      turn,
      plan,
    };
  });
  return [
    ...messageEntries,
    ...traceEntries,
    ...invocationEntries,
    ...planEntries,
  ].sort((left, right) => {
    const timeDifference =
      timestamp(left.createdAt) - timestamp(right.createdAt);
    if (timeDifference !== 0) return timeDifference;
    const rank = (entry: TimelineEntry) => {
      if (entry.kind === "plan") return 1;
      if (entry.kind === "trace") return 1;
      if (entry.kind === "invocation") return 1;
      return entry.message.role === "user" ? 0 : 2;
    };
    return rank(left) - rank(right);
  });
}

function timelineEntryMatches(
  entry: TimelineEntry,
  query: string,
  errorsOnly: boolean,
) {
  if (errorsOnly) {
    if (entry.kind === "invocation") return Boolean(entry.invocation.error);
    if (entry.kind === "trace") {
      return (
        entry.trace.status !== "COMPLETED" && entry.trace.status !== "RUNNING"
      );
    }
    if (entry.kind === "plan") {
      return (
        entry.plan.plan.status === "FAILED" ||
        entry.plan.steps.some((step) => step.status === "FAILED")
      );
    }
    return false;
  }
  if (!query) return true;
  if (entry.kind === "message") {
    return [
      entry.message.content,
      entry.message.agentId,
      entry.message.contextSummary,
    ].some((value) => value?.toLowerCase().includes(query));
  }
  if (entry.kind === "plan") {
    return [
      entry.plan.plan.goal,
      entry.plan.plan.summary,
      entry.plan.plan.status,
      ...entry.plan.steps.flatMap((step) => [
        step.title,
        step.description,
        step.resultSummary,
        step.error,
        ...step.toolNames,
      ]),
    ].some((value) => value?.toLowerCase().includes(query));
  }
  if (entry.kind === "trace") {
    return [
      entry.trace.traceId,
      entry.trace.turnId,
      entry.trace.status,
      ...entry.trace.planDecisions.flatMap((decision) => [
        decision.status,
        decision.reason,
        decision.mode,
      ]),
      ...flattenTraceNodes(entry.trace.roots).flatMap((node) => [
        node.invocation.selectedAgentId,
        node.invocation.agentRole,
        node.invocation.intent,
        node.invocation.responseContent,
        node.invocation.error,
      ]),
    ].some((value) => value?.toLowerCase().includes(query));
  }
  return [
    entry.invocation.selectedAgentId,
    entry.invocation.requestedAgentId,
    entry.invocation.intent,
    entry.invocation.routeReason,
    entry.invocation.agentVersion == null
      ? undefined
      : String(entry.invocation.agentVersion),
    entry.invocation.responseContent,
    entry.invocation.error,
  ].some((value) => value?.toLowerCase().includes(query));
}

function flattenTraceNodes(
  nodes: ConversationInvocationNode[],
): ConversationInvocationNode[] {
  return nodes.flatMap((node) => [node, ...flattenTraceNodes(node.children)]);
}

function traceNodeStatus(node: ConversationInvocationNode) {
  const status = node.invocation.status || "RUNNING";
  if (status === "COMPLETED" || status === "SUCCEEDED") return "completed";
  if (status === "FAILED" || status === "REJECTED") return "failed";
  return "running";
}

function TraceNodeRow({
  node,
  selectedInvocationId,
  onSelectInvocation,
  t,
}: {
  node: ConversationInvocationNode;
  selectedInvocationId?: string;
  onSelectInvocation: (invocationId: string) => void;
  t: Translations;
}) {
  const invocation = node.invocation;
  const status = invocation.status || "RUNNING";
  const tokenTotal =
    (invocation.inputTokens ?? 0) + (invocation.outputTokens ?? 0);
  return (
    <div className="conversation-trace-node">
      <button
        type="button"
        className={`conversation-trace-node-card status-${traceNodeStatus(node)} ${
          selectedInvocationId === invocation.id ? "selected" : ""
        }`}
        aria-pressed={selectedInvocationId === invocation.id}
        onClick={() => onSelectInvocation(invocation.id)}
      >
        <span className="conversation-trace-node-meta">
          <span className="conversation-trace-node-icon">
            <Icon
              name={node.children.length > 0 ? "router" : "bot"}
              size={14}
            />
          </span>
          <span className="conversation-step-label">
            {invocation.agentRole || invocation.spanType || "AGENT"}
          </span>
          <strong>{invocation.selectedAgentId || "-"}</strong>
          <span
            className={`conversation-chip trace-status-${traceNodeStatus(node)}`}
          >
            {status}
          </span>
          <span className="conversation-chip">
            {formatDuration(node.durationMs)}
          </span>
          {tokenTotal > 0 && (
            <span className="conversation-chip">
              {t.conversationTokens} {tokenTotal}
            </span>
          )}
          {node.children.length > 0 && (
            <span className="conversation-chip">
              {t.conversationChildAgents(node.children.length)}
            </span>
          )}
        </span>
        <span className="conversation-invocation-summary">
          {invocation.intent ||
            invocation.routeReason ||
            invocation.error ||
            "-"}
        </span>
        {invocation.error && (
          <span className="conversation-inline-error">
            <Icon name="alert" size={13} />
            {invocation.error}
          </span>
        )}
      </button>
      {node.children.length > 0 && (
        <div className="conversation-trace-children">
          {node.children.map((child) => (
            <TraceNodeRow
              key={child.invocation.id}
              node={child}
              selectedInvocationId={selectedInvocationId}
              onSelectInvocation={onSelectInvocation}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TraceTreeCard({
  trace,
  selectedInvocationId,
  onSelectInvocation,
  t,
}: {
  trace: ConversationTraceTree;
  selectedInvocationId?: string;
  onSelectInvocation: (invocationId: string) => void;
  t: Translations;
}) {
  return (
    <article className="conversation-timeline-entry trace">
      <span className="conversation-timeline-marker">
        <Icon name="agents" size={15} />
      </span>
      <div className="conversation-timeline-card conversation-trace-card">
        <div className="conversation-timeline-meta">
          <span className="conversation-step-label">{t.conversationTrace}</span>
          {trace.attemptNo != null && (
            <span className="conversation-chip">
              {t.conversationAttempt(trace.attemptNo)}
            </span>
          )}
          <span className="conversation-chip">
            {t.conversationAgentCount(trace.agentCount)}
          </span>
          <span className="conversation-chip">
            {t.conversationEventCount(trace.eventCount)}
          </span>
          <span
            className={`conversation-chip trace-status-${trace.status.toLowerCase()}`}
          >
            {trace.status}
          </span>
          <span className="conversation-chip">
            {formatDuration(trace.durationMs)}
          </span>
          {trace.startedAt && (
            <time>{new Date(trace.startedAt).toLocaleString()}</time>
          )}
        </div>
        <div className="conversation-trace-identity">
          <code title={trace.traceId}>{trace.traceId}</code>
          {trace.requestId && (
            <code title={trace.requestId}>{trace.requestId}</code>
          )}
        </div>
        <div className="conversation-trace-plan">
          <span>
            <Icon name="sparkle" size={14} />
            {t.conversationPlanningDecision}
          </span>
          {trace.planDecisions.length === 0 ? (
            <small>{t.conversationPlanningSkipped}</small>
          ) : (
            trace.planDecisions.map((decision) => (
              <div
                className="conversation-trace-plan-item"
                key={decision.eventId}
              >
                <strong>{decision.status || "-"}</strong>
                <span>{decision.mode || "-"}</span>
                <small>{decision.reason || "-"}</small>
                {decision.durationMs != null && (
                  <span>{formatDuration(decision.durationMs)}</span>
                )}
              </div>
            ))
          )}
        </div>
        <div className="conversation-trace-tree">
          {trace.roots.map((root) => (
            <TraceNodeRow
              key={root.invocation.id}
              node={root}
              selectedInvocationId={selectedInvocationId}
              onSelectInvocation={onSelectInvocation}
              t={t}
            />
          ))}
        </div>
      </div>
    </article>
  );
}

function PlanTimelineCard({
  plan,
  selectedPlanId,
  selectedStepId,
  t,
  onSelectPlan,
  onSelectStep,
}: {
  plan: ConversationPlan;
  selectedPlanId?: string;
  selectedStepId?: string;
  t: Translations;
  onSelectPlan: (planId: string) => void;
  onSelectStep: (planId: string, stepId: string) => void;
}) {
  const completed = plan.steps.filter(
    (step) => step.status === "COMPLETED",
  ).length;
  return (
    <article
      className={`conversation-timeline-entry plan ${
        selectedPlanId === plan.plan.id ? "selected" : ""
      }`}
    >
      <span className="conversation-timeline-marker">
        <Icon name="sparkle" size={15} />
      </span>
      <div className="conversation-timeline-card conversation-plan-card">
        <button
          type="button"
          className="conversation-plan-head"
          aria-pressed={selectedPlanId === plan.plan.id}
          onClick={() => onSelectPlan(plan.plan.id)}
        >
          <span className="conversation-timeline-meta">
            <span className="conversation-step-label">
              {t.conversationPlanRevision(plan.plan.revision)}
            </span>
            <strong>{t.conversationPlan}</strong>
            <span className="conversation-chip">
              {planStatusLabel(plan.plan.status, t)}
            </span>
            <span className="conversation-chip">
              {t.conversationPlanProgress(completed, plan.steps.length)}
            </span>
            <Icon name="chevron-right" size={15} />
          </span>
          <span className="conversation-plan-goal">{plan.plan.goal}</span>
        </button>
        <div className="conversation-plan-steps">
          {plan.steps.map((step) => (
            <button
              type="button"
              className={`conversation-plan-step status-${step.status.toLowerCase()} ${
                selectedStepId === step.id ? "selected" : ""
              }`}
              key={step.id}
              onClick={() => onSelectStep(plan.plan.id, step.id)}
            >
              <span className="conversation-plan-step-index">
                {step.stepIndex}
              </span>
              <span className="conversation-plan-step-copy">
                <strong>{step.title}</strong>
                <small>
                  {planStatusLabel(step.status, t)}
                  {step.toolNames.length > 0
                    ? ` · ${step.toolNames.join(", ")}`
                    : ""}
                </small>
              </span>
              {step.durationMs != null && (
                <span className="conversation-chip">
                  {formatDuration(step.durationMs)}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </article>
  );
}

function RouteCopilotTrace({
  trace,
  t,
}: {
  trace?: ConversationInvocationTrace;
  t: Translations;
}) {
  const events =
    trace?.events.filter(
      (event) =>
        event.eventType === "ROUTE_START" || event.eventType === "ROUTE_END",
    ) ?? [];
  const start = events.find((event) => event.eventType === "ROUTE_START");
  const end = events.find((event) => event.eventType === "ROUTE_END");
  if (!start && !end) return null;
  return (
    <section className="conversation-inspector-section">
      <h5>{t.routeCopilotTrace}</h5>
      {start && (
        <details className="conversation-inspector-details">
          <summary>{t.conversationSystemPrompt}</summary>
          <pre>{formatJson(start.payload?.systemPrompt)}</pre>
        </details>
      )}
      {start && (
        <details className="conversation-inspector-details">
          <summary>{t.conversationUserInput}</summary>
          <pre>{formatJson(start.payload?.userInput)}</pre>
        </details>
      )}
      {end && (
        <details className="conversation-inspector-details">
          <summary>{t.conversationRawOutput}</summary>
          <pre>{formatJson(end.payload?.rawModelOutput)}</pre>
        </details>
      )}
      {end && (
        <details className="conversation-inspector-details">
          <summary>{t.conversationRawDetails}</summary>
          <pre>{formatJson(end.payload)}</pre>
        </details>
      )}
    </section>
  );
}

function PlanInspector({
  plan,
  selectedStepId,
  traces,
  t,
  copiedKey,
  onCopy,
}: {
  plan: ConversationPlan;
  selectedStepId?: string;
  traces: ConversationInvocationTrace[];
  t: Translations;
  copiedKey: string;
  onCopy: (value: string, key: string) => void;
}) {
  const selectedStep =
    plan.steps.find((step) => step.id === selectedStepId) ?? plan.steps[0];
  const allEvents = traces.flatMap((trace) => trace.events);
  const planEvents = allEvents.filter((event) => event.planId === plan.plan.id);
  const firstPlanSequence =
    planEvents.length === 0
      ? Number.MAX_SAFE_INTEGER
      : Math.min(
          ...planEvents.map((event) =>
            event.sequence === undefined
              ? Number.MAX_SAFE_INTEGER
              : event.sequence,
          ),
        );
  const prePlanEvents = allEvents
    .filter(
      (event) =>
        firstPlanSequence !== Number.MAX_SAFE_INTEGER &&
        !event.planId &&
        event.invocationId === plan.plan.invocationId &&
        (event.sequence ?? Number.MAX_SAFE_INTEGER) < firstPlanSequence,
    )
    .sort(compareConversationEvents);
  const relatedEvents = allEvents
    .filter((event) =>
      selectedStep
        ? event.planId === plan.plan.id &&
          (!event.planStepId || event.planStepId === selectedStep.id)
        : event.planId === plan.plan.id,
    )
    .sort(compareConversationEvents);
  const completed = plan.steps.filter(
    (step) => step.status === "COMPLETED",
  ).length;
  const copyKey = `plan-${plan.plan.id}`;
  return (
    <aside className="conversation-detail-inspector">
      <div className="conversation-inspector-head">
        <div>
          <span>{t.conversationPlanDetails}</span>
          <h4>{t.conversationPlanRevision(plan.plan.revision)}</h4>
        </div>
        <button
          type="button"
          className="icon-button"
          title={t.conversationCopyStepDetails}
          aria-label={t.conversationCopyStepDetails}
          onClick={() => onCopy(formatJson(plan), copyKey)}
        >
          <Icon name={copiedKey === copyKey ? "check" : "copy"} size={15} />
        </button>
      </div>
      <div className="conversation-inspector-metrics">
        <div>
          <span>{t.status}</span>
          <strong>{planStatusLabel(plan.plan.status, t)}</strong>
        </div>
        <div>
          <span>{t.conversationPlanSteps}</span>
          <strong>
            {t.conversationPlanProgress(completed, plan.steps.length)}
          </strong>
        </div>
        <div>
          <span>{t.duration}</span>
          <strong>
            {plan.plan.startedAt && plan.plan.completedAt
              ? formatDuration(
                  timestamp(plan.plan.completedAt) -
                    timestamp(plan.plan.startedAt),
                )
              : "-"}
          </strong>
        </div>
        <div>
          <span>{t.route}</span>
          <strong>{plan.plan.executorAgentId || "-"}</strong>
        </div>
      </div>
      <section className="conversation-inspector-section">
        <h5>{t.conversationPlanGoal}</h5>
        <p>{plan.plan.goal}</p>
        {plan.plan.summary && <pre>{plan.plan.summary}</pre>}
      </section>
      {selectedStep && (
        <section className="conversation-inspector-section">
          <h5>
            {t.conversationPlanStepLabel(selectedStep.stepIndex)} ·{" "}
            {selectedStep.title}
          </h5>
          <div className="conversation-plan-detail-status">
            <span
              className={`conversation-status status-${selectedStep.status.toLowerCase()}`}
            >
              {planStatusLabel(selectedStep.status, t)}
            </span>
            {selectedStep.durationMs != null && (
              <span>{formatDuration(selectedStep.durationMs)}</span>
            )}
          </div>
          {selectedStep.description && <p>{selectedStep.description}</p>}
          {selectedStep.successCriteria && (
            <details className="conversation-inspector-details">
              <summary>{t.conversationPlanSuccessCriteria}</summary>
              <p>{selectedStep.successCriteria}</p>
            </details>
          )}
          <details className="conversation-inspector-details">
            <summary>{t.tools}</summary>
            <pre>
              {selectedStep.toolNames.length > 0
                ? selectedStep.toolNames.join("\n")
                : "-"}
            </pre>
          </details>
          <details className="conversation-inspector-details" open>
            <summary>{t.conversationPlanStepResult}</summary>
            <pre>{formatJson(selectedStep.resultSummary)}</pre>
          </details>
          {selectedStep.error && (
            <p className="conversation-inline-error">
              <Icon name="alert" size={13} />
              {selectedStep.error}
            </p>
          )}
        </section>
      )}
      <section className="conversation-inspector-section">
        <h5>{t.conversationPlanContextEvents}</h5>
        {prePlanEvents.length === 0 ? (
          <p className="conversation-inspector-empty">-</p>
        ) : (
          <div className="conversation-plan-event-list">
            {prePlanEvents.map((event) => (
              <details
                className="conversation-inspector-details"
                key={event.id}
              >
                <summary>
                  {event.eventName || event.eventType}
                  {event.status ? ` · ${event.status}` : ""}
                  {event.durationMs != null
                    ? ` · ${formatDuration(event.durationMs)}`
                    : ""}
                </summary>
                <pre>{formatJson(event.payload)}</pre>
              </details>
            ))}
          </div>
        )}
      </section>
      <section className="conversation-inspector-section">
        <h5>{t.conversationPlanStepEvents}</h5>
        {relatedEvents.length === 0 ? (
          <p className="conversation-inspector-empty">-</p>
        ) : (
          <div className="conversation-plan-event-list">
            {relatedEvents.map((event) => (
              <details
                className="conversation-inspector-details"
                key={event.id}
              >
                <summary>
                  {event.eventName || event.eventType}
                  {event.status ? ` · ${event.status}` : ""}
                  {event.durationMs != null
                    ? ` · ${formatDuration(event.durationMs)}`
                    : ""}
                </summary>
                <pre>{formatJson(event.payload)}</pre>
              </details>
            ))}
          </div>
        )}
      </section>
      {plan.plan.error && (
        <section className="conversation-inspector-section error">
          <h5>{t.conversationErrorCount}</h5>
          <p>{plan.plan.error}</p>
        </section>
      )}
    </aside>
  );
}

function ExecutionEventList({
  events,
  t,
}: {
  events: ConversationInvocationEvent[];
  t: Translations;
}) {
  if (events.length === 0) {
    return (
      <p className="conversation-inspector-empty">{t.conversationNoEvents}</p>
    );
  }
  return (
    <div className="conversation-event-list">
      {events
        .slice()
        .sort(compareConversationEvents)
        .map((event) => (
          <details className="conversation-event-card" key={event.id}>
            <summary>
              <span className="conversation-event-type">
                <Icon
                  name={
                    event.eventType.startsWith("TOOL")
                      ? "tool"
                      : event.eventType.startsWith("LLM")
                        ? "sparkle"
                        : event.eventType.startsWith("AGENT") ||
                            event.eventType.startsWith("CHILD")
                          ? "agents"
                          : "list"
                  }
                  size={13}
                />
                <strong>{event.eventName || event.eventType}</strong>
              </span>
              <span className="conversation-event-meta">
                <span className="conversation-chip">{event.eventType}</span>
                {event.status && (
                  <span className="conversation-chip">{event.status}</span>
                )}
                {event.durationMs != null && (
                  <span className="conversation-chip">
                    {formatDuration(event.durationMs)}
                  </span>
                )}
                {event.sequenceGlobal != null && (
                  <span className="conversation-chip">
                    #{event.sequenceGlobal}
                  </span>
                )}
              </span>
            </summary>
            <div className="conversation-event-links">
              {event.spanId && (
                <code title={event.spanId}>
                  {t.conversationSpan}: {event.spanId}
                </code>
              )}
              {event.parentEventId && (
                <code title={event.parentEventId}>
                  parent: {event.parentEventId}
                </code>
              )}
            </div>
            <pre>{formatJson(event.payload)}</pre>
          </details>
        ))}
    </div>
  );
}

function ConversationInspector({
  invocation,
  trace,
  plan,
  selectedStepId,
  traces,
  t,
  copiedKey,
  onCopy,
}: {
  invocation?: ConversationInvocation;
  trace?: ConversationInvocationTrace;
  plan?: ConversationPlan;
  selectedStepId?: string;
  traces: ConversationInvocationTrace[];
  t: Translations;
  copiedKey: string;
  onCopy: (value: string, key: string) => void;
}) {
  if (plan) {
    return (
      <PlanInspector
        plan={plan}
        selectedStepId={selectedStepId}
        traces={traces}
        t={t}
        copiedKey={copiedKey}
        onCopy={onCopy}
      />
    );
  }
  if (!invocation) {
    return (
      <aside className="conversation-detail-inspector">
        <h4>{t.conversationStepDetails}</h4>
        <p className="conversation-inspector-empty">
          {t.conversationSelectInvocation}
        </p>
      </aside>
    );
  }
  const copyKey = `step-${invocation.id}`;
  const events = (trace?.events ?? []).slice().sort(compareConversationEvents);
  const planningEvents = events.filter((event) =>
    event.eventType.startsWith("PLAN"),
  );
  const tokenTotal =
    (invocation.inputTokens ?? 0) + (invocation.outputTokens ?? 0);
  return (
    <aside className="conversation-detail-inspector">
      <div className="conversation-inspector-head">
        <div>
          <span>{t.conversationStepDetails}</span>
          <h4>
            {invocation.selectedAgentId || "-"}
            {invocation.agentVersion != null &&
              ` · v${invocation.agentVersion}`}
          </h4>
        </div>
        <button
          type="button"
          className="icon-button"
          title={t.conversationCopyStepDetails}
          aria-label={t.conversationCopyStepDetails}
          onClick={() => onCopy(formatJson(invocation), copyKey)}
        >
          <Icon name={copiedKey === copyKey ? "check" : "copy"} size={15} />
        </button>
      </div>
      <div className="conversation-inspector-metrics">
        <div>
          <span>{t.route}</span>
          <strong>{invocation.routeSource || "-"}</strong>
        </div>
        <div>
          <span>{t.confidence}</span>
          <strong>
            {invocation.confidence == null
              ? "-"
              : invocation.confidence.toFixed(2)}
          </strong>
        </div>
        <div>
          <span>{t.duration}</span>
          <strong>
            {invocation.durationMs == null
              ? "-"
              : `${invocation.durationMs} ms`}
          </strong>
        </div>
        <div>
          <span>{t.clientIp}</span>
          <strong>{invocation.clientIp || "-"}</strong>
        </div>
        <div>
          <span>{t.conversationRole}</span>
          <strong>{invocation.agentRole || invocation.spanType || "-"}</strong>
        </div>
        <div>
          <span>{t.status}</span>
          <strong>{invocation.status || "-"}</strong>
        </div>
        <div>
          <span>{t.conversationTokens}</span>
          <strong>
            {tokenTotal > 0
              ? `${invocation.inputTokens ?? 0} / ${invocation.outputTokens ?? 0}`
              : "-"}
          </strong>
        </div>
        <div>
          <span>{t.conversationTraceId}</span>
          <strong title={invocation.traceId || "-"}>
            {invocation.traceId || "-"}
          </strong>
        </div>
      </div>
      <section className="conversation-inspector-section">
        <h5>{t.intentResult}</h5>
        <p>{invocation.intent || invocation.routeReason || "-"}</p>
      </section>
      <section className="conversation-inspector-section">
        <h5>{t.routeTrail}</h5>
        <div className="conversation-route-trail">
          {invocation.parentInvocationId && (
            <>
              <span>{invocation.parentInvocationId}</span>
              <Icon name="chevron-right" size={14} />
            </>
          )}
          {!invocation.parentInvocationId && (
            <>
              <span>{invocation.requestedAgentId || "auto"}</span>
              <Icon name="chevron-right" size={14} />
            </>
          )}
          <strong>{invocation.selectedAgentId || "-"}</strong>
        </div>
      </section>
      <RouteCopilotTrace trace={trace} t={t} />
      <section className="conversation-inspector-section">
        <h5>{t.conversationPlanningDecision}</h5>
        {planningEvents.length === 0 ? (
          <p className="conversation-inspector-empty">
            {t.conversationPlanningSkipped}
          </p>
        ) : (
          <ExecutionEventList events={planningEvents} t={t} />
        )}
      </section>
      <section className="conversation-inspector-section">
        <h5>{t.conversationExecutionEvents}</h5>
        <ExecutionEventList events={events} t={t} />
      </section>
      <section className="conversation-inspector-section">
        <h5>{t.contextTransfer}</h5>
        <pre>{formatJson(invocation.contextSent)}</pre>
      </section>
      <section className="conversation-inspector-section">
        <h5>{t.responseTransfer}</h5>
        <pre>{formatJson(invocation.responseContent)}</pre>
      </section>
      {invocation.error && (
        <section className="conversation-inspector-section error">
          <h5>{t.conversationErrorCount}</h5>
          <p>{invocation.error}</p>
        </section>
      )}
    </aside>
  );
}

/** Searchable list of stored conversations with a detail overlay. */
export function ConversationLogsPage({
  t,
  logs,
  total,
  page,
  pageSize,
  loading,
  sessionId,
  sessionIdDraft,
  onSessionIdDraftChange,
  onApplyFilter,
  onResetFilter,
  onPageChange,
  onPageSizeChange,
  onOpenLog,
  detail,
  detailOpen,
  detailLoading,
  onCloseDetail,
}: ConversationLogsPageProps) {
  const [detailQuery, setDetailQuery] = useState("");
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [selectedInvocationId, setSelectedInvocationId] = useState<string>();
  const [selectedPlanId, setSelectedPlanId] = useState<string>();
  const [selectedPlanStepId, setSelectedPlanStepId] = useState<string>();
  const [copiedKey, setCopiedKey] = useState("");
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const closeDetailRef = useRef(onCloseDetail);

  useEffect(() => {
    closeDetailRef.current = onCloseDetail;
  }, [onCloseDetail]);

  useEffect(() => {
    if (!detailOpen) return undefined;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(
      () => closeButtonRef.current?.focus(),
      0,
    );
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDetailRef.current();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [detailOpen]);

  useEffect(() => {
    setDetailQuery("");
    setErrorsOnly(false);
    setSelectedInvocationId(undefined);
    setSelectedPlanId(undefined);
    setSelectedPlanStepId(undefined);
  }, [detail?.id]);

  useEffect(() => {
    if (!detail) return;
    if (
      selectedInvocationId &&
      detail.invocations.some(
        (invocation) => invocation.id === selectedInvocationId,
      )
    ) {
      return;
    }
    const preferred =
      detail.invocations.find((invocation) => invocation.error) ??
      detail.invocations[0];
    setSelectedInvocationId(preferred?.id);
  }, [detail, selectedInvocationId]);

  const timeline = useMemo(() => buildTimeline(detail), [detail]);
  const normalizedQuery = detailQuery.trim().toLowerCase();
  const visibleTimeline = timeline.filter((entry) =>
    timelineEntryMatches(entry, normalizedQuery, errorsOnly),
  );
  const selectedInvocation = detail?.invocations.find(
    (invocation) => invocation.id === selectedInvocationId,
  );
  const selectedTrace = detail?.invocationTraces?.find(
    (trace) => trace.invocation.id === selectedInvocationId,
  );
  const selectedPlan = detail?.plans?.find(
    (plan) => plan.plan.id === selectedPlanId,
  );
  const totalDuration =
    detail?.totalDurationMs ??
    detail?.traces?.reduce((sum, trace) => sum + trace.durationMs, 0) ??
    0;
  const errorCount =
    (detail?.invocations.filter((invocation) => Boolean(invocation.error))
      .length ?? 0) +
    (detail?.actions.filter((action) => action.status === "FAILED").length ??
      0) +
    (detail?.plans?.filter(
      (plan) =>
        plan.plan.status === "FAILED" ||
        plan.steps.some((step) => step.status === "FAILED"),
    ).length ?? 0);
  const visibleActions = errorsOnly
    ? (detail?.actions.filter((action) => action.status === "FAILED") ?? [])
    : (detail?.actions ?? []);

  const copyText = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(""), 1600);
    } catch {
      setCopiedKey("");
    }
  };

  return (
    <>
      <section className="conversation-logs-page">
        <p className="muted">{t.conversationLogsSubtitle}</p>

        <div className="conversation-filter" role="search">
          <label className="conversation-filter-field">
            <span>{t.conversationSessionId}</span>
            <input
              type="text"
              value={sessionIdDraft}
              onChange={(event) => onSessionIdDraftChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  onApplyFilter();
                }
              }}
              placeholder={t.conversationSessionIdPlaceholder}
            />
          </label>
          <div className="conversation-filter-actions">
            <button
              type="button"
              onClick={() => {
                onApplyFilter();
              }}
            >
              {t.query}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                onResetFilter();
              }}
            >
              {t.reset}
            </button>
          </div>
        </div>

        {loading ? (
          <p className="empty-documents">{t.loading}</p>
        ) : logs.length === 0 ? (
          <p className="empty-documents">
            {sessionId ? t.noSearchResults : t.noConversationLogs}
          </p>
        ) : (
          <>
            <div className="conversation-table-wrap">
              <table className="conversation-table">
                <colgroup>
                  <col className="conversation-col-id" />
                  <col className="conversation-col-title" />
                  <col className="conversation-col-time" />
                  <col className="conversation-col-count" />
                  <col className="conversation-col-actions" />
                </colgroup>
                <thead>
                  <tr>
                    <th>{t.conversationSessionId}</th>
                    <th>{t.conversationTitle}</th>
                    <th>{t.updatedAt}</th>
                    <th>{t.messageCount}</th>
                    <th className="conversation-table-actions">{t.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td>
                        <TruncatedId
                          value={log.id}
                          head={8}
                          label={t.conversationSessionId}
                        />
                      </td>
                      <td className="conversation-title-cell">
                        {log.title || "-"}
                      </td>
                      <td className="conversation-time-cell">
                        {formatDateTime(log.updatedAt)}
                      </td>
                      <td>{log.messageCount}</td>
                      <td className="conversation-table-actions">
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => onOpenLog(log.id)}
                        >
                          {t.detail}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              labels={{
                total: t.paginationTotal,
                pageSize: t.perPage,
                position: t.paginationPosition,
                prev: t.prevPage,
                next: t.nextPage,
              }}
              onPageChange={onPageChange}
              onPageSizeChange={onPageSizeChange}
            />
          </>
        )}
      </section>

      {detailOpen && (
        <div
          className="conversation-detail-overlay"
          role="presentation"
          onClick={() => closeDetailRef.current()}
        >
          <div
            className="conversation-detail-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="conversation-detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="conversation-detail-head">
              <div className="conversation-detail-title">
                <span>{t.conversationDetailTitle}</span>
                <h3 id="conversation-detail-title">
                  {detail?.title || detail?.id || t.conversationDetailTitle}
                </h3>
                {detail && (
                  <div className="conversation-detail-id">
                    <code>{detail.id}</code>
                    <button
                      type="button"
                      className="icon-button"
                      title={t.conversationCopySessionId}
                      aria-label={t.conversationCopySessionId}
                      onClick={() => copyText(detail.id, "session-id")}
                    >
                      <Icon
                        name={copiedKey === "session-id" ? "check" : "copy"}
                        size={15}
                      />
                    </button>
                  </div>
                )}
              </div>
              <button
                type="button"
                ref={closeButtonRef}
                className="icon-button"
                title={t.close}
                aria-label={t.close}
                onClick={() => closeDetailRef.current()}
              >
                <Icon name="close" size={16} />
              </button>
            </div>

            {detailLoading ? (
              <div className="conversation-detail-state">
                <p className="empty-documents">{t.loading}</p>
              </div>
            ) : !detail ? (
              <div className="conversation-detail-state">
                <p className="empty-documents">{t.noSearchResults}</p>
              </div>
            ) : (
              <>
                <div className="conversation-detail-summary">
                  <div
                    className={`conversation-summary-stat status ${
                      errorCount > 0 ? "attention" : "healthy"
                    }`}
                  >
                    <span>{t.status}</span>
                    <strong>
                      <Icon
                        name={errorCount > 0 ? "alert" : "check"}
                        size={14}
                      />
                      {errorCount > 0
                        ? t.conversationNeedsAttention
                        : t.conversationHealthy}
                    </strong>
                  </div>
                  <div className="conversation-summary-stat">
                    <span>{t.messageCount}</span>
                    <strong>{detail.messages.length}</strong>
                  </div>
                  <div className="conversation-summary-stat">
                    <span>{t.conversationTotalCalls}</span>
                    <strong>{detail.invocations.length}</strong>
                  </div>
                  <div className="conversation-summary-stat">
                    <span>{t.actionDetails}</span>
                    <strong>{detail.actions.length}</strong>
                  </div>
                  <div className="conversation-summary-stat">
                    <span>{t.conversationPlans}</span>
                    <strong>{detail.plans?.length ?? 0}</strong>
                  </div>
                  <div className="conversation-summary-stat">
                    <span>{t.conversationTotalDuration}</span>
                    <strong>{formatDuration(totalDuration)}</strong>
                  </div>
                </div>

                <div className="conversation-detail-toolbar">
                  <label className="conversation-detail-search">
                    <span className="sr-only">
                      {t.conversationSearchPlaceholder}
                    </span>
                    <Icon name="search" size={15} />
                    <input
                      value={detailQuery}
                      onChange={(event) => setDetailQuery(event.target.value)}
                      placeholder={t.conversationSearchPlaceholder}
                    />
                  </label>
                  <button
                    type="button"
                    className={
                      errorsOnly
                        ? "secondary conversation-filter-toggle active"
                        : "secondary conversation-filter-toggle"
                    }
                    aria-pressed={errorsOnly}
                    onClick={() => setErrorsOnly((value) => !value)}
                  >
                    <Icon name="alert" size={15} />
                    {t.conversationOnlyErrors}
                  </button>
                </div>

                <div className="conversation-detail-workspace">
                  <div className="conversation-detail-timeline">
                    <div className="conversation-timeline-heading">
                      <div>
                        <span>{t.conversationOverview}</span>
                        <h4>{t.conversationTimeline}</h4>
                      </div>
                      <span>
                        {visibleTimeline.length}/{timeline.length}
                      </span>
                    </div>
                    {visibleTimeline.length === 0 ? (
                      <p className="conversation-timeline-empty">
                        {t.conversationNoMatches}
                      </p>
                    ) : (
                      <div className="conversation-timeline-list">
                        {visibleTimeline.map((entry) =>
                          entry.kind === "plan" ? (
                            <PlanTimelineCard
                              key={entry.id}
                              plan={entry.plan}
                              selectedPlanId={selectedPlanId}
                              selectedStepId={selectedPlanStepId}
                              t={t}
                              onSelectPlan={(planId) => {
                                setSelectedPlanId(planId);
                                setSelectedPlanStepId(entry.plan.steps[0]?.id);
                                setSelectedInvocationId(undefined);
                              }}
                              onSelectStep={(planId, stepId) => {
                                setSelectedPlanId(planId);
                                setSelectedPlanStepId(stepId);
                                setSelectedInvocationId(undefined);
                              }}
                            />
                          ) : entry.kind === "trace" ? (
                            <TraceTreeCard
                              key={entry.id}
                              trace={entry.trace}
                              selectedInvocationId={selectedInvocationId}
                              t={t}
                              onSelectInvocation={(invocationId) => {
                                setSelectedInvocationId(invocationId);
                                setSelectedPlanId(undefined);
                                setSelectedPlanStepId(undefined);
                              }}
                            />
                          ) : entry.kind === "message" ? (
                            <article
                              className={`conversation-timeline-entry ${entry.message.role}`}
                              key={entry.id}
                            >
                              <span className="conversation-timeline-marker">
                                <Icon
                                  name={
                                    entry.message.role === "user"
                                      ? "chat"
                                      : "bot"
                                  }
                                  size={15}
                                />
                              </span>
                              <div className="conversation-timeline-card">
                                <div className="conversation-timeline-meta">
                                  <span className="conversation-step-label">
                                    {t.conversationTurn(entry.turn)}
                                  </span>
                                  <strong>
                                    {entry.message.role === "user"
                                      ? t.userMessage
                                      : t.assistantMessage}
                                  </strong>
                                  {entry.message.agentId && (
                                    <code>{entry.message.agentId}</code>
                                  )}
                                  {entry.createdAt && (
                                    <time>
                                      {new Date(
                                        entry.createdAt,
                                      ).toLocaleString()}
                                    </time>
                                  )}
                                </div>
                                <p>{entry.message.content || "-"}</p>
                                {entry.message.attachments?.length ? (
                                  <div
                                    className="conversation-log-attachments"
                                    aria-label={t.attachments}
                                  >
                                    {entry.message.attachments.map(
                                      (attachment) => (
                                        <div
                                          className={
                                            attachment.isImage
                                              ? "conversation-log-attachment image"
                                              : "conversation-log-attachment"
                                          }
                                          key={attachment.id}
                                          title={attachment.filename}
                                        >
                                          {attachment.isImage &&
                                            attachment.url && (
                                              <AuthAttachmentImage
                                                asLink
                                                url={attachment.url}
                                                alt={`${t.imageAttachment}: ${attachment.filename}`}
                                                filename={attachment.filename}
                                                linkClassName="conversation-log-attachment-preview"
                                                closeLabel={t.close}
                                              />
                                            )}
                                          <span className="conversation-log-attachment-kind">
                                            {attachment.isImage
                                              ? t.imageAttachment
                                              : t.fileAttachment}
                                          </span>
                                          <span className="conversation-log-attachment-name">
                                            {attachment.filename}
                                          </span>
                                          <small>
                                            {attachment.contentType || "-"} ·{" "}
                                            {formatFileSize(attachment.size)}
                                          </small>
                                        </div>
                                      ),
                                    )}
                                  </div>
                                ) : null}
                                {entry.message.contextSummary && (
                                  <details className="conversation-inline-details">
                                    <summary>Context</summary>
                                    <pre>{entry.message.contextSummary}</pre>
                                  </details>
                                )}
                              </div>
                            </article>
                          ) : (
                            <article
                              className={`conversation-timeline-entry invocation ${
                                selectedInvocationId === entry.id
                                  ? "selected"
                                  : ""
                              }`}
                              key={entry.id}
                            >
                              <span className="conversation-timeline-marker">
                                <Icon name="router" size={15} />
                              </span>
                              <button
                                type="button"
                                className="conversation-timeline-card conversation-invocation-card"
                                aria-pressed={selectedInvocationId === entry.id}
                                onClick={() => {
                                  setSelectedInvocationId(entry.invocation.id);
                                  setSelectedPlanId(undefined);
                                  setSelectedPlanStepId(undefined);
                                }}
                              >
                                <span className="conversation-timeline-meta">
                                  <span className="conversation-step-label">
                                    {t.conversationTurn(entry.turn)}
                                  </span>
                                  <strong>
                                    {entry.invocation.selectedAgentId || "-"}
                                  </strong>
                                  {entry.invocation.agentVersion != null && (
                                    <span className="conversation-chip">
                                      v{entry.invocation.agentVersion}
                                    </span>
                                  )}
                                  <span className="conversation-chip">
                                    {entry.invocation.routeSource || "-"}
                                  </span>
                                  {entry.invocation.confidence != null && (
                                    <span className="conversation-chip">
                                      {t.confidence}{" "}
                                      {entry.invocation.confidence.toFixed(2)}
                                    </span>
                                  )}
                                  {entry.invocation.durationMs != null && (
                                    <span className="conversation-chip">
                                      {entry.invocation.durationMs} ms
                                    </span>
                                  )}
                                  {entry.createdAt && (
                                    <time>
                                      {new Date(
                                        entry.createdAt,
                                      ).toLocaleString()}
                                    </time>
                                  )}
                                  <Icon name="chevron-right" size={15} />
                                </span>
                                <span className="conversation-invocation-summary">
                                  {entry.invocation.intent ||
                                    entry.invocation.routeReason ||
                                    "-"}
                                </span>
                                {entry.invocation.error && (
                                  <span className="conversation-inline-error">
                                    <Icon name="alert" size={13} />
                                    {entry.invocation.error}
                                  </span>
                                )}
                              </button>
                            </article>
                          ),
                        )}
                      </div>
                    )}

                    {visibleActions.length > 0 && (
                      <details
                        className="conversation-action-section"
                        open={errorsOnly || undefined}
                      >
                        <summary>
                          <span>
                            <Icon name="play" size={14} />
                            {t.actionDetails}
                          </span>
                          <span>{visibleActions.length}</span>
                        </summary>
                        <div className="conversation-action-list">
                          {visibleActions.map((action) => (
                            <div
                              className="conversation-action-card"
                              key={action.actionId}
                            >
                              <div className="conversation-timeline-meta">
                                <strong>{action.type || "-"}</strong>
                                <span
                                  className={
                                    action.status === "COMPLETED"
                                      ? "ok"
                                      : action.status === "FAILED"
                                        ? "off"
                                        : "badge"
                                  }
                                >
                                  {action.status === "COMPLETED"
                                    ? t.actionCompleted
                                    : action.status === "FAILED"
                                      ? t.actionFailed
                                      : t.actionPending}
                                </span>
                              </div>
                              <code>{action.target || action.actionId}</code>
                              {action.reason && <p>{action.reason}</p>}
                              {action.result && <pre>{action.result}</pre>}
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                  <ConversationInspector
                    invocation={selectedInvocation}
                    trace={selectedTrace}
                    plan={selectedPlan}
                    selectedStepId={selectedPlanStepId}
                    traces={detail.invocationTraces ?? []}
                    t={t}
                    copiedKey={copiedKey}
                    onCopy={copyText}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
