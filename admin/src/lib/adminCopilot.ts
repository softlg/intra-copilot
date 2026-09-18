import { apiFetch, request } from "./api";
import { buildApiError } from "./apiError";

export type CopilotMode = "ASSIST" | "BUILD";

export type CopilotSessionSummary = {
  id: string;
  title: string;
  mode: CopilotMode;
  status: string;
  pinned: boolean;
  currentAgentId?: string;
  stateJson?: string;
  lastMessagePreview?: string;
  createdAt: string;
  updatedAt: string;
};

export type CopilotMessage = {
  id: string;
  role: "user" | "assistant" | string;
  content: string;
  payloadJson?: string;
  model?: string;
  createdAt: string;
};

export type CopilotProposal = {
  id: string;
  sessionId: string;
  kind: string;
  title: string;
  payloadJson: string;
  status: "READY" | "APPLIED" | string;
  appliedTargetType?: string;
  appliedTargetId?: string;
  createdAt: string;
  confirmedAt?: string;
};

export type CopilotSession = CopilotSessionSummary & {
  messages: CopilotMessage[];
  proposals: CopilotProposal[];
};

export type CopilotResourcePlanItem = {
  ref?: string;
  kind?: string;
  data?: Record<string, unknown>;
};

export type CopilotAgentPlan = {
  displayName?: string;
  description?: string;
  role?: string;
  systemPrompt?: string;
  knowledgeBaseRefs?: string[];
  toolRefs?: string[];
  skillRefs?: string[];
  parentAgentRef?: string;
};

export type CopilotProposalPayload = {
  resources?: CopilotResourcePlanItem[];
  agent?: CopilotAgentPlan;
  childBindings?: Array<Record<string, unknown>>;
};

export type CopilotRespondResult = {
  reply?: string;
  phase?: string;
  questions?: Array<{
    field?: string;
    prompt?: string;
    required?: boolean;
  }>;
  requirements?: Record<string, unknown>;
  patch?: {
    agentId?: string | null;
    changes?: Record<string, unknown>;
  };
  proposal?: CopilotProposalPayload;
  proposalId?: string;
};

export type ValidationSeverity = "critical" | "error" | "warning" | "info";

export type AgentValidationIssue = {
  severity: ValidationSeverity;
  code: string;
  title: string;
  detail: string;
  patch?: Record<string, unknown>;
};

export type AgentValidationCase = {
  caseId?: string;
  title: string;
  input: string;
  pageContext?: string;
  expected: string;
  actualResponse?: string;
  passed?: boolean;
  reason?: string;
  suggestedPatch?: Record<string, unknown>;
};

export type AgentValidationReport = {
  runId: string;
  agentId: string;
  agentVersion: number;
  configHash: string;
  status: string;
  staticIssues: AgentValidationIssue[];
  cases: AgentValidationCase[];
  summary: {
    issueCount: number;
    critical: number;
    error: number;
    warning: number;
    info: number;
    testsRun: number;
    testsPassed: number;
    testsFailed: number;
  };
  createdAt: string;
};

export type AgentValidationHistoryItem = {
  id: string;
  agentId: string;
  agentVersion: number;
  status: string;
  reportJson: string;
  createdAt: string;
  completedAt?: string;
};

export type AgentValidationRemediation = {
  agentId: string;
  summary: string;
  sourceCaseCount: number;
  patch: Record<string, unknown>;
};

export function listCopilotSessions() {
  return request<CopilotSessionSummary[]>("/admin/copilot/sessions");
}

export function createCopilotSession(
  mode: CopilotMode,
  currentAgentId?: string,
) {
  return request<CopilotSession>("/admin/copilot/sessions", {
    method: "POST",
    body: JSON.stringify({
      mode,
      title: mode === "BUILD" ? "新建 Agent" : "配置助手",
      currentAgentId: currentAgentId || null,
    }),
  });
}

export function getCopilotSession(id: string) {
  return request<CopilotSession>(`/admin/copilot/sessions/${id}`);
}

export function renameCopilotSession(id: string, title: string) {
  return updateCopilotSession(id, { title });
}

export function updateCopilotSession(
  id: string,
  changes: { title?: string; pinned?: boolean },
) {
  return request<CopilotSession>(`/admin/copilot/sessions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(changes),
  });
}

export function deleteCopilotSessions(ids: string[]) {
  return request<{ requested: number; deleted: number }>(
    "/admin/copilot/sessions/delete",
    {
      method: "POST",
      body: JSON.stringify({ ids }),
    },
  );
}

export function respondCopilot(
  id: string,
  message: string,
  currentAgentId: string | undefined,
  context: Record<string, unknown>,
) {
  return request<CopilotRespondResult>(
    `/admin/copilot/sessions/${id}/respond`,
    {
      method: "POST",
      body: JSON.stringify({
        message,
        currentAgentId: currentAgentId || null,
        context,
      }),
    },
  );
}

export type CopilotRespondStreamHandlers = {
  onRunStart?: (payload: { runId: string }) => void;
  onPhase?: (payload: { phase: string; message: string }) => void;
  onDone?: (result: CopilotRespondResult) => void;
  onCancelled?: (payload: { runId: string }) => void;
  onStreamError?: (payload: { message: string }) => void;
};

function handleCopilotFrame(
  frame: string,
  handlers: CopilotRespondStreamHandlers,
) {
  let name = "";
  const data: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) name = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trim());
  }
  if (!name || data.length === 0) return;
  let payload: unknown;
  try {
    payload = JSON.parse(data.join("\n"));
  } catch {
    return;
  }
  if (name === "run_start") {
    handlers.onRunStart?.(payload as { runId: string });
  } else if (name === "phase") {
    handlers.onPhase?.(payload as { phase: string; message: string });
  } else if (name === "done") {
    handlers.onDone?.(payload as CopilotRespondResult);
  } else if (name === "cancelled") {
    handlers.onCancelled?.(payload as { runId: string });
  } else if (name === "error") {
    handlers.onStreamError?.(payload as { message: string });
  }
}

export async function streamCopilotResponse(
  id: string,
  message: string,
  currentAgentId: string | undefined,
  context: Record<string, unknown>,
  handlers: CopilotRespondStreamHandlers,
  signal?: AbortSignal,
) {
  const response = await apiFetch(
    `/admin/copilot/sessions/${id}/respond/stream`,
    {
      method: "POST",
      body: JSON.stringify({
        message,
        currentAgentId: currentAgentId || null,
        context,
      }),
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
      },
      signal,
    },
  );
  if (!response.ok) {
    const detail = await response.text();
    throw buildApiError(response, detail);
  }
  if (!response.body) return;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      handleCopilotFrame(buffer.slice(0, boundary), handlers);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");
    }
  }
}

export function cancelCopilotResponse(sessionId: string, runId: string) {
  return request<{ runId: string; canceled: boolean }>(
    `/admin/copilot/sessions/${sessionId}/respond/${runId}/cancel`,
    { method: "POST" },
  );
}

export function applyCopilotProposal(id: string) {
  return request<{
    proposalId: string;
    status: string;
    targetType: string;
    targetId: string;
  }>(`/admin/copilot/proposals/${id}/apply`, { method: "POST" });
}

export function validateAgentStatic(agentId: string) {
  return request<AgentValidationReport>(
    `/admin/agents/${agentId}/validations/static`,
    { method: "POST" },
  );
}

export function generateAgentValidationCases(agentId: string) {
  return request<{ agentId: string; cases: AgentValidationCase[] }>(
    `/admin/agents/${agentId}/validations/cases`,
    { method: "POST" },
  );
}

export function validateAgentBehavior(
  agentId: string,
  cases: AgentValidationCase[],
) {
  return request<AgentValidationReport>(
    `/admin/agents/${agentId}/validations/behavior`,
    {
      method: "POST",
      body: JSON.stringify({ cases }),
    },
  );
}

export function generateAgentValidationRemediation(
  agentId: string,
  cases: AgentValidationCase[],
  currentAgent: Record<string, unknown>,
) {
  return request<AgentValidationRemediation>(
    `/admin/agents/${agentId}/validations/remediation`,
    {
      method: "POST",
      body: JSON.stringify({
        cases,
        currentSystemPrompt: currentAgent.systemPrompt ?? "",
        currentDescription: currentAgent.description ?? "",
        currentRoutingRules: currentAgent.routingRules ?? "",
      }),
    },
  );
}

export type ValidationStreamHandlers = {
  onRunStart?: (payload: { runId: string; total: number }) => void;
  onCaseStart?: (payload: {
    caseId: string;
    index: number;
    total: number;
    title: string;
    input: string;
  }) => void;
  onCaseResult?: (payload: {
    index: number;
    total: number;
    passed: boolean;
    case: AgentValidationCase;
  }) => void;
  onDone?: (report: AgentValidationReport) => void;
  onStreamError?: (payload: { message: string }) => void;
};

function handleValidationFrame(
  frame: string,
  handlers: ValidationStreamHandlers,
) {
  let name = "";
  const data: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) name = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trim());
  }
  if (!name || data.length === 0) return;
  let payload: unknown;
  try {
    payload = JSON.parse(data.join("\n"));
  } catch {
    return;
  }
  if (name === "run_start") {
    handlers.onRunStart?.(payload as { runId: string; total: number });
  } else if (name === "case_start") {
    handlers.onCaseStart?.(
      payload as {
        caseId: string;
        index: number;
        total: number;
        title: string;
        input: string;
      },
    );
  } else if (name === "case_result") {
    handlers.onCaseResult?.(
      payload as {
        index: number;
        total: number;
        passed: boolean;
        case: AgentValidationCase;
      },
    );
  } else if (name === "done") {
    handlers.onDone?.(payload as AgentValidationReport);
  } else if (name === "error") {
    handlers.onStreamError?.(payload as { message: string });
  }
}

/**
 * Runs the selected scenarios over SSE so each outcome arrives as soon as it is ready
 * instead of waiting for the whole batch.
 */
export async function streamValidateAgentBehavior(
  agentId: string,
  cases: AgentValidationCase[],
  handlers: ValidationStreamHandlers,
  signal?: AbortSignal,
) {
  const response = await apiFetch(
    `/admin/agents/${agentId}/validations/behavior/stream`,
    {
      method: "POST",
      body: JSON.stringify({ cases }),
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
      },
      signal,
    },
  );
  if (!response.ok) {
    const detail = await response.text();
    throw buildApiError(response, detail);
  }
  if (!response.body) return;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      handleValidationFrame(buffer.slice(0, boundary), handlers);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");
    }
  }
}

export function cancelValidationStream(agentId: string, runId: string) {
  return request<{ runId: string; canceled: boolean }>(
    `/admin/agents/${agentId}/validations/behavior/${runId}/cancel`,
    { method: "POST" },
  );
}

export function listAgentValidationHistory(agentId: string, limit = 8) {
  return request<AgentValidationHistoryItem[]>(
    `/admin/agents/${agentId}/validations?limit=${limit}`,
  );
}
