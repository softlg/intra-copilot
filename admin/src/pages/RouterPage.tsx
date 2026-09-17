import {
  Fragment,
  useEffect,
  useState,
  type ClipboardEvent,
  type CSSProperties,
} from "react";
import { AuthAttachmentImage } from "../components/AuthAttachmentImage";
import { Icon, type IconName } from "../components/Icon";
import { toast } from "../components/Toast";
import type { Translations } from "../i18n/translations";
import type { ConversationAttachment } from "../types";

type RouteRecord = Record<string, unknown>;
type RouteNodeStatus =
  "pending" | "active" | "success" | "warning" | "error" | "preview";

interface RouteFlowNode {
  id: string;
  type: string;
  title: string;
  summary: string;
  status: RouteNodeStatus;
  durationMs: number;
  icon: IconName;
  details: RouteRecord;
}

function records(value: unknown): RouteRecord[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is RouteRecord => typeof item === "object" && item != null,
      )
    : [];
}

function stringValue(value: unknown, fallback = "-") {
  return value == null || value === "" ? fallback : String(value);
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stepTitle(type: string, fallback: string, t: Translations) {
  switch (type) {
    case "input":
      return t.routeInput;
    case "intent":
      return t.routeIntent;
    case "dispatch":
      return t.routeDispatch;
    case "delegation":
      return t.routeDelegation;
    case "resources":
      return t.routeResources;
    case "planning":
      return t.routePlanning;
    case "hooks":
      return t.routeHooks;
    case "result":
      return t.routeFinalAnswer;
    default:
      return fallback;
  }
}

function statusLabel(status: RouteNodeStatus, t: Translations) {
  switch (status) {
    case "active":
      return t.routeStageRunning;
    case "success":
      return t.routeStageDone;
    case "warning":
      return t.routeStageWarning;
    case "error":
      return t.routeStageFailed;
    case "preview":
      return t.routeStagePreview;
    default:
      return t.routeStagePending;
  }
}

function statusIcon(status: RouteNodeStatus): IconName {
  switch (status) {
    case "active":
      return "refresh";
    case "success":
      return "check";
    case "warning":
      return "warn";
    case "error":
      return "close";
    case "preview":
      return "flag";
    default:
      return "circle";
  }
}

function nodeIcon(type: string): IconName {
  switch (type) {
    case "intent":
      return "sparkle";
    case "dispatch":
      return "router";
    case "delegation":
      return "agents";
    case "hooks":
      return "hook";
    case "resources":
      return "grid";
    case "planning":
      return "list";
    case "result":
      return "flag";
    default:
      return "chat";
  }
}

function routeStatus(
  type: string,
  details: RouteRecord,
  testing: boolean,
  index: number,
  activeStage: number,
  hasRoute: boolean,
): RouteNodeStatus {
  if (testing) {
    if (index < activeStage) return "success";
    if (index === activeStage) return "active";
    return "pending";
  }
  if (!hasRoute) {
    return type === "result" ? "preview" : "pending";
  }
  if (type === "result") return "preview";
  if (type === "hooks" && details.passed === false) return "error";
  if (type === "planning" && details.failed === true) return "error";
  if (
    type === "intent" &&
    ["rules", "context"].includes(String(details.routeSource ?? ""))
  ) {
    return "warning";
  }
  if (type === "planning" && details.enabled === false) return "preview";
  if (
    type === "resources" &&
    Array.isArray(details.warnings) &&
    details.warnings.length > 0
  ) {
    return "warning";
  }
  return "success";
}

function connectorState(node: RouteFlowNode, next?: RouteFlowNode) {
  if (!next) return "none";
  if (node.status === "error") return "error";
  if (["success", "warning"].includes(node.status)) return "complete";
  if (node.status === "active") return "current";
  return "pending";
}

function RawDetails({ label, value }: { label: string; value: unknown }) {
  if (value == null || value === "") return null;
  const rendered =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
  if (!rendered) return null;
  return (
    <details className="router-chain-raw">
      <summary>{label}</summary>
      <pre>{rendered}</pre>
    </details>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "danger" | "warning";
}) {
  return (
    <span className={tone ? `is-${tone}` : undefined}>
      {label}: {value}
    </span>
  );
}

function ResourceBucket({
  label,
  items,
  emptyLabel,
  meta,
  icon,
  tone,
}: {
  label: string;
  items: RouteRecord[];
  emptyLabel: string;
  meta: (item: RouteRecord) => string;
  icon: IconName;
  tone?: "used";
}) {
  return (
    <div className={`router-resource-bucket${tone ? ` is-${tone}` : ""}`}>
      <div className="router-resource-bucket-head">
        <Icon name={icon} size={14} />
        <span>{label}</span>
        <b>{items.length}</b>
      </div>
      {items.length ? (
        <div className="router-resource-items">
          {items.map((item, index) => (
            <div
              className="router-resource-item"
              key={`${stringValue(item.id ?? item.name)}-${index}`}
            >
              <strong>{stringValue(item.name ?? item.id, emptyLabel)}</strong>
              <small>{meta(item)}</small>
            </div>
          ))}
        </div>
      ) : (
        <p>{emptyLabel}</p>
      )}
    </div>
  );
}

function HookDetails({
  details,
  t,
}: {
  details: RouteRecord;
  t: Translations;
}) {
  const checks = records(details.checks);
  if (!checks.length) return <p>{t.hookPassed}</p>;
  return (
    <div className="router-hook-cards">
      {checks.map((check, index) => {
        const passed = check.passed !== false;
        return (
          <div
            className={`router-hook-card ${passed ? "is-ok" : "is-off"}`}
            key={`${stringValue(check.hookId)}-${index}`}
          >
            <div className="router-hook-card-head">
              <Icon name={passed ? "check" : "close"} size={14} />
              <strong>{stringValue(check.hookName ?? check.hookId)}</strong>
              <span>{passed ? t.hookPassed : t.hookRejected}</span>
            </div>
            <div className="router-hook-card-meta">
              {check.ruleType ? (
                <Metric
                  label={t.routeHookRuleType}
                  value={stringValue(check.ruleType)}
                />
              ) : null}
              {check.phase ? (
                <Metric
                  label={t.routeHookPhase}
                  value={stringValue(check.phase)}
                />
              ) : null}
              {check.failMode ? (
                <Metric
                  label={t.routeHookFailMode}
                  value={stringValue(check.failMode)}
                />
              ) : null}
              {numberValue(check.durationMs) > 0 ? (
                <Metric
                  label={t.routeDuration}
                  value={`${numberValue(check.durationMs)} ms`}
                />
              ) : null}
            </div>
            {check.message ? (
              <p>
                <b>{t.routeHookMessage}:</b> {stringValue(check.message)}
              </p>
            ) : null}
            {check.evaluationError ? (
              <p className="is-danger">
                <b>{t.routeHookError}:</b> {stringValue(check.evaluationError)}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function PlanningDetails({
  details,
  t,
}: {
  details: RouteRecord;
  t: Translations;
}) {
  const planningSteps = records(details.steps);
  return (
    <>
      <div className="router-chain-meta">
        <Metric
          label={t.routePlanningEnabled}
          value={details.enabled ? t.yes : t.no}
        />
        <Metric
          label={t.routePlanningTriggered}
          value={details.triggered ? t.yes : t.no}
        />
        <Metric label={t.routePlanningMode} value={stringValue(details.mode)} />
        {details.failed ? (
          <Metric label={t.routePlanningFailed} value="" tone="danger" />
        ) : null}
        {details.repaired ? <span>{t.routePlanningRepaired}</span> : null}
        {numberValue(details.durationMs) > 0 ? (
          <Metric
            label={t.routeDuration}
            value={`${numberValue(details.durationMs)} ms`}
          />
        ) : null}
        {details.inputTokens != null ? (
          <Metric
            label={t.routeInputTokens}
            value={numberValue(details.inputTokens)}
          />
        ) : null}
        {details.outputTokens != null ? (
          <Metric
            label={t.routeOutputTokens}
            value={numberValue(details.outputTokens)}
          />
        ) : null}
      </div>
      {details.goal ? (
        <p className="router-detail-lead">
          <b>{t.routePlanningGoal}:</b> {stringValue(details.goal)}
        </p>
      ) : null}
      {details.summary ? <p>{stringValue(details.summary)}</p> : null}
      {planningSteps.length ? (
        <ol className="router-plan-steps">
          {planningSteps.map((planStep, index) => (
            <li key={`${stringValue(planStep.title)}-${index}`}>
              <strong>{stringValue(planStep.title)}</strong>
              {planStep.description
                ? ` · ${stringValue(planStep.description)}`
                : ""}
              {Array.isArray(planStep.toolNames) &&
              planStep.toolNames.length ? (
                <code>
                  {planStep.toolNames.map((item) => String(item)).join(", ")}
                </code>
              ) : null}
              {Array.isArray(planStep.dependsOn) &&
              planStep.dependsOn.length ? (
                <small>
                  {t.routePlanDependsOn}:{" "}
                  {planStep.dependsOn.map((item) => String(item)).join(", ")}
                </small>
              ) : null}
              {planStep.successCriteria ? (
                <small>
                  {t.routePlanSuccess}: {stringValue(planStep.successCriteria)}
                </small>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
      <RawDetails label={t.routeRawOutput} value={details.modelOutput} />
      <RawDetails
        label={t.routePlannerRequest}
        value={details.plannerRequest}
      />
    </>
  );
}

function ResourcesDetails({
  details,
  t,
}: {
  details: RouteRecord;
  t: Translations;
}) {
  const skills = records(details.skills);
  const tools = records(details.tools);
  const mcpServers = records(details.mcpServers);
  const knowledgeBases = records(details.knowledgeBases);
  const usedSkills = [
    ...records(details.usedSkills),
    ...records(details.invokedSkills),
  ];
  const usedTools = [
    ...records(details.usedTools),
    ...records(details.invokedTools),
  ];
  const usedKnowledgeBases = [
    ...records(details.usedKnowledgeBases),
    ...records(details.retrievedKnowledgeBases),
  ];
  const warnings = Array.isArray(details.warnings)
    ? details.warnings.map((warning) => String(warning))
    : [];
  const hasUsedResources =
    usedSkills.length + usedTools.length + usedKnowledgeBases.length > 0;

  return (
    <>
      <div className="router-chain-meta">
        {details.model ? (
          <Metric label="Model" value={stringValue(details.model)} />
        ) : null}
        {details.temperature != null ? (
          <Metric
            label="Temperature"
            value={stringValue(details.temperature)}
          />
        ) : null}
        {details.role ? (
          <Metric label="Role" value={stringValue(details.role)} />
        ) : null}
      </div>
      <div className="router-resource-section-heading">
        <span>{t.routeBoundResources}</span>
      </div>
      <div className="router-resource-grid">
        <ResourceBucket
          label={t.routeSkills}
          items={skills}
          emptyLabel={t.routeNone}
          icon="sparkle"
          meta={(item) =>
            item.versionLabel || item.version
              ? `v${stringValue(item.versionLabel ?? item.version)}`
              : ""
          }
        />
        <ResourceBucket
          label={t.routeTools}
          items={tools}
          emptyLabel={t.routeNone}
          icon="tool"
          meta={(item) =>
            [item.type, item.mcpServerName]
              .filter(Boolean)
              .map(String)
              .join(" · ")
          }
        />
        <ResourceBucket
          label={t.routeMcpServers}
          items={mcpServers}
          emptyLabel={t.routeNone}
          icon="mcp"
          meta={(item) => stringValue(item.status, "")}
        />
        <ResourceBucket
          label={t.routeKnowledgeBases}
          items={knowledgeBases}
          emptyLabel={t.routeNone}
          icon="knowledge"
          meta={(item) => stringValue(item.status, "")}
        />
      </div>
      {hasUsedResources ? (
        <>
          <div className="router-resource-section-heading is-used">
            <span>{t.routeUsedResources}</span>
          </div>
          <div className="router-resource-grid">
            <ResourceBucket
              label={t.routeSkills}
              items={usedSkills}
              emptyLabel={t.routeNotExecuted}
              icon="sparkle"
              tone="used"
              meta={(item) =>
                stringValue(item.versionLabel ?? item.version, "")
              }
            />
            <ResourceBucket
              label={t.routeTools}
              items={usedTools}
              emptyLabel={t.routeNotExecuted}
              icon="tool"
              tone="used"
              meta={(item) => stringValue(item.status, "")}
            />
            <ResourceBucket
              label={t.routeKnowledgeBases}
              items={usedKnowledgeBases}
              emptyLabel={t.routeNotExecuted}
              icon="knowledge"
              tone="used"
              meta={(item) => stringValue(item.status, "")}
            />
          </div>
        </>
      ) : null}
      {warnings.length ? (
        <div className="router-resource-list danger">
          <strong>{t.routeWarnings}</strong>
          {warnings.map((warning, index) => (
            <span key={`${warning}-${index}`}>{warning}</span>
          ))}
        </div>
      ) : null}
      <RawDetails
        label={t.routeEffectivePrompt}
        value={details.effectiveSystemPrompt}
      />
    </>
  );
}

function StepDetails({
  node,
  route,
  t,
}: {
  node: RouteFlowNode;
  route?: RouteRecord;
  t: Translations;
}) {
  const details = node.details;
  switch (node.type) {
    case "input": {
      const attachmentIds = Array.isArray(details.attachmentIds)
        ? details.attachmentIds.map(String)
        : [];
      return (
        <>
          <p className="router-detail-lead">
            {stringValue(details.message, t.routeImageOnly)}
          </p>
          <div className="router-chain-meta">
            <Metric
              label={t.routerReadPage}
              value={details.pageContextIncluded ? t.yes : t.no}
            />
            <Metric
              label={t.routerImages}
              value={numberValue(details.imageCount)}
            />
            <Metric
              label={t.routeContextLength}
              value={numberValue(details.pageContextLength)}
            />
          </div>
          {attachmentIds.length ? (
            <div className="router-chain-meta">
              {attachmentIds.map((id) => (
                <span key={id}>{id}</span>
              ))}
            </div>
          ) : null}
          <RawDetails label={t.routerPageContext} value={details.pageContext} />
        </>
      );
    }
    case "intent":
      return (
        <>
          <p className="router-detail-lead">
            {stringValue(details.intent, stringValue(route?.reason))}
          </p>
          <div className="router-chain-meta">
            <Metric
              label={t.confidence}
              value={
                details.confidence == null
                  ? "-"
                  : `${Math.round(numberValue(details.confidence) * 100)}%`
              }
              tone={
                numberValue(details.confidence) < 0.55 ? "warning" : undefined
              }
            />
            <Metric
              label={t.routeSource}
              value={stringValue(details.routeSource)}
            />
            <Metric
              label={t.routeRouteAgent}
              value={stringValue(details.agentId)}
            />
            {node.durationMs > 0 ? (
              <Metric label={t.routeDuration} value={`${node.durationMs} ms`} />
            ) : null}
          </div>
          <RawDetails label={t.routeDispatchInput} value={details.modelInput} />
          <RawDetails label={t.routeRawOutput} value={details.modelOutput} />
          <RawDetails
            label={t.routeSystemPrompt}
            value={details.systemPrompt}
          />
        </>
      );
    case "dispatch":
      return (
        <>
          <p className="router-detail-lead">
            {stringValue(
              details.displayName ?? route?.displayName ?? details.agentId,
            )}
          </p>
          <div className="router-chain-meta">
            <Metric
              label={t.routeRouteAgent}
              value={stringValue(details.routeAgentId)}
            />
            <Metric
              label={t.routeExecutionAgent}
              value={stringValue(details.agentId)}
            />
            <Metric
              label={t.routeDelegated}
              value={details.delegated ? t.yes : t.no}
            />
            {route?.needsClarification ? (
              <Metric label={t.routeIntent} value={t.routeStageWarning} />
            ) : null}
          </div>
        </>
      );
    case "delegation": {
      const candidates = records(details.candidates);
      return (
        <>
          <p className="router-detail-lead">
            {stringValue(details.displayName ?? details.agentId)}
            {details.reason ? ` · ${stringValue(details.reason)}` : ""}
          </p>
          <div className="router-chain-meta">
            <Metric label={t.routeMode} value={stringValue(details.mode)} />
            <Metric
              label={t.confidence}
              value={
                details.confidence == null
                  ? "-"
                  : `${Math.round(numberValue(details.confidence) * 100)}%`
              }
            />
            {details.matchedRule ? (
              <Metric
                label={t.routeMatchedRule}
                value={stringValue(details.matchedRule)}
              />
            ) : null}
            {node.durationMs > 0 ? (
              <Metric label={t.routeDuration} value={`${node.durationMs} ms`} />
            ) : null}
          </div>
          {candidates.length ? (
            <div className="router-resource-list">
              <strong>{t.routeCandidates}</strong>
              {candidates.map((candidate, index) => (
                <span key={`${stringValue(candidate.agentId)}-${index}`}>
                  {stringValue(candidate.displayName ?? candidate.agentId)}
                  {candidate.priority != null
                    ? ` · P${numberValue(candidate.priority)}`
                    : ""}
                  {candidate.routingRule
                    ? ` · ${stringValue(candidate.routingRule)}`
                    : ""}
                </span>
              ))}
            </div>
          ) : null}
          <RawDetails label={t.routeRawOutput} value={details.modelOutput} />
          <RawDetails
            label={t.routeDispatchInput}
            value={details.dispatchInput}
          />
          <RawDetails
            label={t.routeDispatchPrompt}
            value={details.dispatchPrompt}
          />
        </>
      );
    }
    case "hooks":
      return <HookDetails details={details} t={t} />;
    case "resources":
      return <ResourcesDetails details={details} t={t} />;
    case "planning":
      return <PlanningDetails details={details} t={t} />;
    case "result":
      return <p className="router-preview-note">{t.routePreviewOnly}</p>;
    default:
      return <p>{node.summary}</p>;
  }
}

export interface RouterPageProps {
  t: Translations;
  message: string;
  onMessageChange: (value: string) => void;
  pageContext: string;
  onPageContextChange: (value: string) => void;
  onTestRoute: () => void;
  attachments: ConversationAttachment[];
  uploadingAttachments: boolean;
  readPage: boolean;
  onReadPageChange: (value: boolean) => void;
  onUploadAttachments: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
  onPastePageContext: () => void;
  onOpenPageContext: () => void;
  route?: RouteRecord;
  testing: boolean;
  error: string;
  onCancelTest: () => void;
  analyzing: boolean;
  onAnalyze: () => void;
  analysis: string;
}

/** Router playground: inspect routing, delegation, resources, and planning. */
export function RouterPage({
  t,
  message,
  onMessageChange,
  pageContext,
  onPageContextChange,
  onTestRoute,
  attachments,
  uploadingAttachments,
  readPage,
  onReadPageChange,
  onUploadAttachments,
  onRemoveAttachment,
  onPastePageContext,
  onOpenPageContext,
  route,
  testing,
  error,
  onCancelTest,
  analyzing,
  onAnalyze,
  analysis,
}: RouterPageProps) {
  const [activeStage, setActiveStage] = useState(0);
  const [selectedNodeId, setSelectedNodeId] = useState("");

  useEffect(() => {
    if (!testing) return;
    setActiveStage(0);
    const intervalId = window.setInterval(() => {
      setActiveStage((current) => Math.min(current + 1, 7));
    }, 680);
    return () => window.clearInterval(intervalId);
  }, [testing]);

  useEffect(() => {
    setSelectedNodeId("");
  }, [route, testing]);

  const actualSteps = records(route?.steps);
  const projectedSteps = [
    "input",
    "intent",
    "dispatch",
    "delegation",
    "hooks",
    "resources",
    "planning",
    "result",
  ];
  const sourceSteps = [
    ...(actualSteps.length
      ? actualSteps
      : projectedSteps.map((type) => ({ type, title: "", details: {} }))),
  ];
  if (sourceSteps.at(-1)?.type !== "result") {
    sourceSteps.push({ type: "result", title: "", details: {} });
  }

  const flowNodes: RouteFlowNode[] = sourceSteps.map((step, index) => {
    const type = stringValue(step.type);
    const details = records([step.details])[0] ?? {};
    const status = routeStatus(
      type,
      details,
      testing,
      index,
      activeStage,
      Boolean(route),
    );
    const durationMs = numberValue(details.durationMs);
    let summary: string = t.routeNotExecuted;
    if (testing) {
      summary = statusLabel(status, t);
    } else if (type === "input") {
      summary = stringValue(details.message, t.routeImageOnly);
    } else if (type === "intent") {
      summary = stringValue(details.intent ?? route?.reason);
    } else if (type === "dispatch" || type === "delegation") {
      summary = stringValue(details.displayName ?? details.agentId);
    } else if (type === "hooks") {
      summary = details.passed === false ? t.hookRejected : t.hookPassed;
    } else if (type === "resources") {
      const count =
        records(details.skills).length +
        records(details.tools).length +
        records(details.mcpServers).length +
        records(details.knowledgeBases).length;
      summary = `${count} ${t.routeBoundResources}`;
    } else if (type === "planning") {
      summary = details.failed
        ? t.routePlanningFailed
        : stringValue(details.goal ?? details.mode, t.routeNotExecuted);
    } else if (type === "result") {
      summary = t.routePreviewOnly;
    }
    return {
      id: `${type}-${index}`,
      type,
      title: stepTitle(type, stringValue(step.title, type), t),
      summary,
      status,
      durationMs,
      icon: nodeIcon(type),
      details,
    };
  });

  const selectedNode =
    flowNodes.find((node) => node.id === selectedNodeId) ??
    [...flowNodes].reverse().find((node) => node.status === "error") ??
    [...flowNodes].reverse().find((node) => node.status === "warning") ??
    flowNodes.find((node) => node.status === "active") ??
    flowNodes[Math.max(0, flowNodes.length - 2)] ??
    flowNodes[0];

  const confidence = numberValue(route?.confidence);
  const confidencePercent =
    route?.confidence == null ? 0 : Math.round(confidence * 100);
  const totalDuration = flowNodes.reduce(
    (sum, node) => sum + (node.type === "result" ? 0 : node.durationMs),
    0,
  );
  const isLowConfidence = route?.confidence != null && confidencePercent < 55;
  const isDegraded = ["rules", "context"].includes(
    stringValue(route?.routeSource, ""),
  );
  const traceStatus = testing
    ? t.routerTraceLive
    : route
      ? t.routerTraceReady
      : t.routerTraceIdle;

  const pasteImagesFromClipboard = async () => {
    if (!navigator.clipboard?.read) {
      toast.error(t.routerClipboardUnavailable);
      return;
    }
    try {
      const items = await navigator.clipboard.read();
      const files: File[] = [];
      for (const item of items) {
        for (const type of item.types.filter((value) =>
          value.startsWith("image/"),
        )) {
          const blob = await item.getType(type);
          const extension = type.split("/")[1]?.replace("jpeg", "jpg") || "png";
          files.push(
            new File(
              [blob],
              `pasted-image-${Date.now()}-${files.length + 1}.${extension}`,
              { type },
            ),
          );
        }
      }
      if (!files.length) {
        toast.error(t.routerClipboardImageMissing);
        return;
      }
      onUploadAttachments(files);
    } catch {
      toast.error(t.routerClipboardUnavailable);
    }
  };

  const handleImagePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file != null);
    if (!files.length) return;
    event.preventDefault();
    onUploadAttachments(files);
  };

  const copyRoute = async () => {
    if (!route) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(route, null, 2));
      toast.success(t.routeCopied);
    } catch (copyError) {
      toast.error(
        copyError instanceof Error ? copyError.message : t.copyFailed,
      );
    }
  };

  const canTest = Boolean(message.trim() || attachments.length);

  return (
    <section
      className={`router-test-page${testing ? " is-testing" : ""}`}
      aria-busy={testing}
    >
      <div className={`router-test-form${testing ? " is-testing" : ""}`}>
        <div className="router-form-heading">
          <div>
            <span className="router-form-kicker">{t.routerTest}</span>
            <h2>{t.testRoute}</h2>
          </div>
          <span className={`router-live-pill ${testing ? "is-live" : ""}`}>
            <span />
            {traceStatus}
          </span>
        </div>

        <label className="router-field" htmlFor="router-message">
          <span>{t.routerMessageLabel}</span>
          <textarea
            id="router-message"
            value={message}
            onChange={(event) => onMessageChange(event.target.value)}
            onPaste={handleImagePaste}
            placeholder={t.routerPlaceholder}
            rows={4}
            disabled={testing}
          />
        </label>

        <div className="router-context-field">
          <label className="router-field" htmlFor="router-page-context">
            <span>{t.routerContextLabel}</span>
            <textarea
              id="router-page-context"
              value={pageContext}
              onChange={(event) => onPageContextChange(event.target.value)}
              placeholder={t.routerContextPlaceholder}
              rows={3}
              disabled={testing}
            />
          </label>
          <div className="router-context-actions">
            <button
              type="button"
              className="secondary"
              disabled={testing}
              onClick={onPastePageContext}
            >
              <Icon name="copy" size={14} /> {t.routerPasteContext}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={testing}
              onClick={onOpenPageContext}
            >
              <Icon name="chevron-right" size={14} /> {t.routerOpenPage}
            </button>
          </div>
        </div>

        <div className="router-test-options">
          <button
            type="button"
            className={`router-upload-button${uploadingAttachments ? " uploading" : ""}`}
            disabled={uploadingAttachments || testing}
            onClick={() => void pasteImagesFromClipboard()}
          >
            <Icon name="copy" size={14} />
            {uploadingAttachments ? t.routerUploading : t.routerPasteImages}
          </button>
          <label className="checkbox-field router-read-page">
            <input
              type="checkbox"
              checked={readPage}
              disabled={testing}
              onChange={(event) => onReadPageChange(event.target.checked)}
            />
            <span>{t.routerReadPage}</span>
          </label>
        </div>

        {attachments.length > 0 ? (
          <div className="router-attachments" aria-label={t.routerImages}>
            {attachments.map((attachment) => (
              <div className="router-attachment" key={attachment.id}>
                {attachment.isImage ? (
                  <AuthAttachmentImage
                    url={attachment.url}
                    alt={attachment.filename}
                  />
                ) : (
                  <span className="router-attachment-kind">
                    {t.routerImages}
                  </span>
                )}
                <span title={attachment.filename}>{attachment.filename}</span>
                <button
                  type="button"
                  className="router-attachment-remove"
                  onClick={() => onRemoveAttachment(attachment.id)}
                  aria-label={`${t.routerRemoveImage}: ${attachment.filename}`}
                  title={t.routerRemoveImage}
                  disabled={testing}
                >
                  <Icon name="close" size={13} />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="router-test-actions">
          <button
            type="button"
            className="router-test-submit"
            onClick={onTestRoute}
            disabled={!canTest || testing || uploadingAttachments}
          >
            <Icon
              name={testing ? "refresh" : "play"}
              size={15}
              className={testing ? "router-spin" : undefined}
            />
            {testing ? t.routerTesting : t.testRoute}
          </button>
          {testing ? (
            <button type="button" className="secondary" onClick={onCancelTest}>
              <Icon name="close" size={14} /> {t.routerCancelTest}
            </button>
          ) : null}
          <button
            type="button"
            className="secondary"
            onClick={onAnalyze}
            disabled={!route || testing || analyzing}
          >
            <Icon name="sparkle" size={14} />
            {analyzing ? t.analyzing : t.smartAnalyze}
          </button>
        </div>
        {error ? (
          <div className="router-test-error" role="alert">
            <Icon name="alert" size={15} />
            <div>
              <strong>{t.routerTestFailed}</strong>
              <p>{error}</p>
            </div>
          </div>
        ) : null}
      </div>

      <div className="router-result-summary">
        <div className="router-summary-agent">
          <span>{t.route}</span>
          <strong>{stringValue(route?.displayName ?? route?.agentId)}</strong>
          <small>
            {stringValue(route?.routeDisplayName ?? route?.routeAgentId, "")}
          </small>
        </div>
        <div className="router-summary-confidence">
          <div
            className={`router-confidence-gauge${
              isLowConfidence ? " is-low" : ""
            }`}
            style={
              {
                "--route-confidence": `${confidencePercent * 3.6}deg`,
              } as CSSProperties
            }
            role="img"
            aria-label={`${t.confidence}: ${confidencePercent}%`}
          >
            <span>{route ? `${confidencePercent}%` : "-"}</span>
          </div>
          <div>
            <span>{t.confidence}</span>
            <strong>
              {isLowConfidence ? t.routeConfidenceLow : t.confidence}
            </strong>
          </div>
        </div>
        <div>
          <span>{t.routeSource}</span>
          <strong>{stringValue(route?.routeSource)}</strong>
          {isDegraded ? <small>{t.routeFallback}</small> : null}
        </div>
        <div>
          <span>{t.routeTotalDuration}</span>
          <strong>
            {totalDuration > 0 ? `${totalDuration} ms` : t.routeNotExecuted}
          </strong>
        </div>
        <button
          type="button"
          className="router-copy"
          onClick={() => void copyRoute()}
          disabled={!route}
          aria-label={t.routeCopy}
          title={t.routeCopy}
        >
          <Icon name="copy" size={14} /> {t.routeCopy}
        </button>
      </div>

      <section
        className={`router-trace-panel${testing ? " is-testing" : ""}`}
        aria-live="polite"
      >
        <div className="router-trace-header">
          <div>
            <span className="router-form-kicker">
              {testing ? t.routerTraceLive : t.routerTraceReady}
            </span>
            <h3>{t.routeChain}</h3>
          </div>
          <span
            className={`router-trace-state is-${testing ? "live" : "ready"}`}
          >
            <Icon name={testing ? "refresh" : "check"} size={14} />
            {traceStatus}
          </span>
        </div>

        <div className="router-flow-viewport">
          <div className="router-flow" role="list">
            {flowNodes.map((node, index) => {
              const pathState = connectorState(node, flowNodes[index + 1]);
              return (
                <Fragment key={`${node.id}-${route ? "result" : "idle"}`}>
                  <div
                    className={`router-flow-node is-${node.status}${
                      !testing && route ? " is-revealed" : ""
                    }`}
                    role="listitem"
                    data-path={pathState}
                    style={
                      {
                        "--route-node-index": index,
                      } as CSSProperties
                    }
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedNodeId(node.id)}
                      aria-current={
                        selectedNode?.id === node.id ? "step" : undefined
                      }
                    >
                      <span className="router-node-icon">
                        <Icon name={node.icon} size={17} />
                      </span>
                      <span className="router-node-copy">
                        <strong>{node.title}</strong>
                        <small>{node.summary}</small>
                      </span>
                      <span className="router-node-status">
                        <Icon
                          name={statusIcon(node.status)}
                          size={13}
                          className={
                            node.status === "active" ? "router-spin" : undefined
                          }
                        />
                        {statusLabel(node.status, t)}
                      </span>
                    </button>
                  </div>
                </Fragment>
              );
            })}
          </div>
        </div>

        {selectedNode ? (
          <div className="router-stage-inspector">
            <header>
              <div>
                <span>{t.routeSelectedStage}</span>
                <strong>{selectedNode.title}</strong>
              </div>
              <span
                className={`router-inspector-status is-${selectedNode.status}`}
              >
                <Icon name={statusIcon(selectedNode.status)} size={13} />
                {statusLabel(selectedNode.status, t)}
              </span>
            </header>
            <div className="router-stage-inspector-body">
              {route || testing ? (
                <StepDetails node={selectedNode} route={route} t={t} />
              ) : (
                <p className="router-preview-note">{t.routeChainEmpty}</p>
              )}
            </div>
          </div>
        ) : null}
      </section>

      {analysis ? (
        <section className="router-analysis">
          <h3>{t.routeAnalysis}</h3>
          <p>{analysis}</p>
        </section>
      ) : null}
    </section>
  );
}
