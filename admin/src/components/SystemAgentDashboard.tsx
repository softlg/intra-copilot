import type { CSSProperties } from "react";
import type { Translations } from "../i18n/translations";
import type { Agent } from "../types";
import { Icon, type IconName } from "./Icon";
import type { AgentRoleCounts } from "./SystemAgentHeroCard";
import "./SystemAgentDashboard.css";

type DashboardTone = "brand" | "success" | "warning" | "danger";
type DashboardTab =
  | "router"
  | "conversation-logs"
  | "agents-general"
  | "agents-domain"
  | "agents-sub";

type SystemAgentDashboardProps = {
  systemAgent: Agent;
  agents: Agent[];
  counts: AgentRoleCounts;
  t: Translations;
  onNavigate: (tab: DashboardTab) => void;
  onCreateDomain: () => void;
  onOpenSystemSettings: () => void;
};

type Metric = {
  key: string;
  label: string;
  value: string | number;
  hint: string;
  icon: IconName;
  tone: DashboardTone;
};

type RoleReadiness = {
  key: "general" | "domain" | "sub";
  label: string;
  hint: string;
  count: number;
  enabled: number;
  tab: Extract<DashboardTab, `agents-${string}`>;
  icon: IconName;
};

type RuntimeSignal = {
  key: string;
  tone: Exclude<DashboardTone, "brand">;
  icon: IconName;
  title: string;
  description: string;
  actionLabel?: string;
  tab?: DashboardTab;
};

function agentRoleOf(agent: Agent) {
  return agent.role ?? (agent.systemAgent ? "MAIN" : "DOMAIN");
}

function percent(enabled: number, total: number) {
  if (total === 0) return 0;
  return Math.round((enabled / total) * 100);
}

function roleProgressStyle(enabled: number, total: number) {
  return {
    "--system-dashboard-role-progress": `${percent(enabled, total)}%`,
  } as CSSProperties;
}

export function SystemAgentDashboard({
  systemAgent,
  agents,
  counts,
  t,
  onNavigate,
  onCreateDomain,
  onOpenSystemSettings,
}: SystemAgentDashboardProps) {
  const executionAgents = agents.filter(
    (agent) => agentRoleOf(agent) !== "MAIN",
  );
  const enabledExecutionAgents = executionAgents.filter(
    (agent) => agent.enabled,
  );

  const enabledByRole = (role: "GENERAL" | "DOMAIN" | "SUB") =>
    executionAgents.filter(
      (agent) => agentRoleOf(agent) === role && agent.enabled,
    ).length;

  const enabledGeneral = enabledByRole("GENERAL");
  const enabledDomain = enabledByRole("DOMAIN");
  const enabledSub = enabledByRole("SUB");
  const orphanSubAgents = executionAgents.filter((agent) => {
    if (agentRoleOf(agent) !== "SUB") return false;
    return (
      !agent.parentAgentId ||
      !executionAgents.some((parent) => parent.id === agent.parentAgentId)
    );
  }).length;
  const disabledExecutionAgents =
    executionAgents.length - enabledExecutionAgents.length;

  const metrics: Metric[] = [
    {
      key: "entry",
      label: t.systemDashboardEntryStatus,
      value: systemAgent.enabled
        ? t.systemDashboardOnline
        : t.systemDashboardOffline,
      hint: systemAgent.enabled
        ? t.systemDashboardEntryOnlineHint
        : t.systemDashboardEntryOfflineHint,
      icon: "router",
      tone: systemAgent.enabled ? "success" : "danger",
    },
    {
      key: "nodes",
      label: t.systemDashboardActiveNodes,
      value: `${enabledExecutionAgents.length}/${executionAgents.length}`,
      hint: t.systemDashboardActiveNodesHint,
      icon: "agents",
      tone:
        executionAgents.length > 0 && enabledExecutionAgents.length > 0
          ? "brand"
          : "warning",
    },
    {
      key: "fallback",
      label: t.systemDashboardFallback,
      value: enabledGeneral,
      hint:
        enabledGeneral > 0
          ? t.systemDashboardFallbackReadyHint
          : t.systemDashboardFallbackMissingHint,
      icon: "flag",
      tone: enabledGeneral > 0 ? "success" : "danger",
    },
    {
      key: "delegation",
      label: t.systemDashboardDelegation,
      value: executionAgents.filter(
        (agent) => agentRoleOf(agent) === "SUB" && Boolean(agent.parentAgentId),
      ).length,
      hint: t.systemDashboardDelegationHint,
      icon: "hook",
      tone: enabledSub > 0 ? "brand" : "warning",
    },
  ];

  const readiness: RoleReadiness[] = [
    {
      key: "general",
      label: t.generalAgentPage,
      hint: t.generalAgentPageHint,
      count: counts.general,
      enabled: enabledGeneral,
      tab: "agents-general",
      icon: "flag",
    },
    {
      key: "domain",
      label: t.domainAgentPage,
      hint: t.domainAgentPageHint,
      count: counts.domain,
      enabled: enabledDomain,
      tab: "agents-domain",
      icon: "router",
    },
    {
      key: "sub",
      label: t.subAgentPage,
      hint: t.subAgentPageHint,
      count: counts.sub,
      enabled: enabledSub,
      tab: "agents-sub",
      icon: "hook",
    },
  ];

  const signals: RuntimeSignal[] = [];
  if (!systemAgent.enabled) {
    signals.push({
      key: "system-disabled",
      tone: "danger",
      icon: "alert",
      title: t.systemDashboardSystemDisabled,
      description: t.systemDashboardSystemDisabledHint,
    });
  }
  if (enabledGeneral === 0) {
    signals.push({
      key: "fallback",
      tone: "danger",
      icon: "flag",
      title: t.systemDashboardMissingFallback,
      description: t.systemDashboardMissingFallbackHint,
      actionLabel: t.systemDashboardOpenGeneral,
      tab: "agents-general",
    });
  }
  if (enabledDomain === 0) {
    signals.push({
      key: "domain",
      tone: "warning",
      icon: "router",
      title: t.systemDashboardMissingDomain,
      description: t.systemDashboardMissingDomainHint,
      actionLabel: t.systemDashboardCreateDomain,
    });
  }
  if (orphanSubAgents > 0) {
    signals.push({
      key: "orphan-sub",
      tone: "warning",
      icon: "hook",
      title: t.systemDashboardOrphanSub(orphanSubAgents),
      description: t.systemDashboardOrphanSubHint,
      actionLabel: t.systemDashboardOpenSub,
      tab: "agents-sub",
    });
  }
  if (disabledExecutionAgents > 0) {
    signals.push({
      key: "disabled",
      tone: "warning",
      icon: "pause",
      title: t.systemDashboardDisabledAgents(disabledExecutionAgents),
      description: t.systemDashboardDisabledAgentsHint,
    });
  }

  const healthy =
    systemAgent.enabled &&
    enabledGeneral > 0 &&
    enabledDomain > 0 &&
    orphanSubAgents === 0 &&
    disabledExecutionAgents === 0;

  const healthChecks = [
    {
      key: "entry",
      label: t.systemDashboardEntryStatus,
      ready: systemAgent.enabled,
    },
    {
      key: "fallback",
      label: t.systemDashboardFallback,
      ready: enabledGeneral > 0,
    },
    {
      key: "domain",
      label: t.domainAgentPage,
      ready: enabledDomain > 0,
    },
    {
      key: "delegation",
      label: t.systemDashboardDelegation,
      ready: enabledSub > 0 && orphanSubAgents === 0,
    },
  ];

  return (
    <section
      className="system-agent-dashboard"
      aria-labelledby="system-agent-dashboard-title"
    >
      <header className="system-agent-dashboard-header">
        <div>
          <h3 id="system-agent-dashboard-title">{t.systemDashboardTitle}</h3>
          <p>{t.systemDashboardSubtitle}</p>
        </div>
        <span
          className={`system-agent-dashboard-health ${
            healthy ? "is-healthy" : "is-attention"
          }`}
        >
          <Icon name={healthy ? "check" : "warn"} size={13} />
          {healthy ? t.systemDashboardHealthy : t.systemDashboardAttention}
        </span>
      </header>

      <div className="system-agent-metrics">
        {metrics.map((metric) => (
          <div
            key={metric.key}
            className={`system-agent-metric is-${metric.tone}`}
          >
            <span className="system-agent-metric-icon">
              <Icon name={metric.icon} size={16} />
            </span>
            <div>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.hint}</small>
            </div>
          </div>
        ))}
      </div>

      <div className="system-agent-dashboard-grid">
        <section className="system-agent-panel system-agent-topology-panel">
          <header className="system-agent-panel-heading">
            <div>
              <h4>{t.systemDashboardTopology}</h4>
              <p>{t.systemDashboardTopologyHint}</p>
            </div>
            <span>{t.systemDashboardTopologyLive}</span>
          </header>

          <div className="system-agent-topology">
            <div className="system-agent-topology-entry">
              <span className="system-agent-topology-node-icon">
                <Icon name="router" size={17} />
              </span>
              <div>
                <strong>{systemAgent.displayName}</strong>
                <span>{t.systemAgentGlobalEntry}</span>
              </div>
              <span className={systemAgent.enabled ? "is-ready" : "is-off"}>
                <Icon
                  name={systemAgent.enabled ? "check" : "close"}
                  size={12}
                />
                {systemAgent.enabled ? t.enabled : t.disabled}
              </span>
            </div>

            <div className="system-agent-topology-branches">
              <button
                type="button"
                className="system-agent-topology-branch"
                onClick={() => onNavigate("agents-general")}
              >
                <span
                  className="system-agent-topology-line"
                  aria-hidden="true"
                />
                <span className="system-agent-topology-node-icon">
                  <Icon name="flag" size={15} />
                </span>
                <span className="system-agent-topology-copy">
                  <strong>{t.generalAgentPage}</strong>
                  <small>{t.systemDashboardFallbackLayer}</small>
                </span>
                <span
                  className={enabledGeneral > 0 ? "is-ready" : "is-attention"}
                >
                  {enabledGeneral > 0
                    ? t.systemDashboardReady
                    : t.systemDashboardNoItems}
                </span>
                <span className="system-agent-topology-count">
                  {enabledGeneral}/{counts.general}
                </span>
                <Icon name="chevron-right" size={15} />
              </button>

              <button
                type="button"
                className="system-agent-topology-branch"
                onClick={() => onNavigate("agents-domain")}
              >
                <span
                  className="system-agent-topology-line"
                  aria-hidden="true"
                />
                <span className="system-agent-topology-node-icon">
                  <Icon name="router" size={15} />
                </span>
                <span className="system-agent-topology-copy">
                  <strong>{t.domainAgentPage}</strong>
                  <small>{t.systemDashboardDomainLayer}</small>
                </span>
                <span
                  className={enabledDomain > 0 ? "is-ready" : "is-attention"}
                >
                  {enabledDomain > 0
                    ? t.systemDashboardReady
                    : t.systemDashboardNoItems}
                </span>
                <span className="system-agent-topology-count">
                  {enabledDomain}/{counts.domain}
                </span>
                <Icon name="chevron-right" size={15} />
              </button>

              <button
                type="button"
                className="system-agent-topology-branch"
                onClick={() => onNavigate("agents-sub")}
              >
                <span
                  className="system-agent-topology-line"
                  aria-hidden="true"
                />
                <span className="system-agent-topology-node-icon">
                  <Icon name="hook" size={15} />
                </span>
                <span className="system-agent-topology-copy">
                  <strong>{t.subAgentPage}</strong>
                  <small>{t.systemDashboardSubLayer}</small>
                </span>
                <span className={enabledSub > 0 ? "is-ready" : "is-attention"}>
                  {enabledSub > 0
                    ? t.systemDashboardReady
                    : t.systemDashboardNoItems}
                </span>
                <span className="system-agent-topology-count">
                  {enabledSub}/{counts.sub}
                </span>
                <Icon name="chevron-right" size={15} />
              </button>
            </div>
          </div>
        </section>

        <section className="system-agent-panel">
          <header className="system-agent-panel-heading">
            <div>
              <h4>{t.systemDashboardCoverage}</h4>
              <p>{t.systemDashboardCoverageHint}</p>
            </div>
          </header>
          <div className="system-agent-readiness-list">
            {readiness.map((item) => (
              <button
                key={item.key}
                type="button"
                className="system-agent-readiness-row"
                style={roleProgressStyle(item.enabled, item.count)}
                onClick={() => onNavigate(item.tab)}
              >
                <span className="system-agent-readiness-label">
                  <span>
                    <Icon name={item.icon} size={14} />
                    {item.label}
                  </span>
                  <small>{item.hint}</small>
                </span>
                <span className="system-agent-readiness-track">
                  <span />
                </span>
                <strong>
                  {item.enabled}/{item.count}
                </strong>
                <span className="system-agent-readiness-percent">
                  {percent(item.enabled, item.count)}%
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="system-agent-panel">
          <header className="system-agent-panel-heading">
            <div>
              <h4>{t.systemDashboardSignals}</h4>
              <p>{t.systemDashboardSignalsHint}</p>
            </div>
          </header>
          <div className="system-agent-signals">
            {signals.length === 0 ? (
              <div className="system-agent-signal is-success">
                <span>
                  <Icon name="check" size={15} />
                </span>
                <div>
                  <strong>{t.systemDashboardAllClear}</strong>
                  <p>{t.systemDashboardAllClearHint}</p>
                </div>
              </div>
            ) : (
              signals.slice(0, 4).map((signal) => (
                <div
                  key={signal.key}
                  className={`system-agent-signal is-${signal.tone}`}
                >
                  <span>
                    <Icon name={signal.icon} size={15} />
                  </span>
                  <div>
                    <strong>{signal.title}</strong>
                    <p>{signal.description}</p>
                    {signal.actionLabel &&
                      (signal.tab ? (
                        <button
                          type="button"
                          className="tertiary"
                          onClick={() => onNavigate(signal.tab!)}
                        >
                          {signal.actionLabel}
                          <Icon name="chevron-right" size={13} />
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="tertiary"
                          onClick={onCreateDomain}
                        >
                          {signal.actionLabel}
                          <Icon name="plus" size={13} />
                        </button>
                      ))}
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="system-agent-health-checks">
            <span>{t.systemDashboardChecklist}</span>
            <div>
              {healthChecks.map((check) => (
                <span
                  key={check.key}
                  className={check.ready ? "is-ready" : "is-attention"}
                >
                  <Icon name={check.ready ? "check" : "warn"} size={13} />
                  <span>{check.label}</span>
                  <strong>
                    {check.ready
                      ? t.systemDashboardReady
                      : t.systemDashboardAttention}
                  </strong>
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="system-agent-panel">
          <header className="system-agent-panel-heading">
            <div>
              <h4>{t.systemDashboardQuickActions}</h4>
              <p>{t.systemDashboardQuickActionsHint}</p>
            </div>
          </header>
          <div className="system-agent-quick-actions">
            <button type="button" onClick={() => onNavigate("router")}>
              <span>
                <Icon name="play" size={16} />
              </span>
              <span>
                <strong>{t.systemDashboardTestRoute}</strong>
                <small>{t.systemDashboardTestRouteHint}</small>
              </span>
              <Icon name="chevron-right" size={15} />
            </button>
            <button
              type="button"
              onClick={() => onNavigate("conversation-logs")}
            >
              <span>
                <Icon name="chat" size={16} />
              </span>
              <span>
                <strong>{t.systemDashboardViewLogs}</strong>
                <small>{t.systemDashboardViewLogsHint}</small>
              </span>
              <Icon name="chevron-right" size={15} />
            </button>
            <button type="button" onClick={onCreateDomain}>
              <span>
                <Icon name="plus" size={16} />
              </span>
              <span>
                <strong>{t.systemDashboardCreateDomain}</strong>
                <small>{t.systemDashboardCreateDomainHint}</small>
              </span>
              <Icon name="chevron-right" size={15} />
            </button>
            <button type="button" onClick={onOpenSystemSettings}>
              <span>
                <Icon name="settings" size={16} />
              </span>
              <span>
                <strong>{t.settings}</strong>
                <small>{t.systemDashboardSystemSettingsHint}</small>
              </span>
              <Icon name="chevron-right" size={15} />
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}
