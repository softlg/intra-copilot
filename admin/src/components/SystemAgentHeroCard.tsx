import type { Translations } from "../i18n/translations";
import type { Agent } from "../types";
import { Icon } from "./Icon";
import "./SystemAgentHeroCard.css";

export type AgentRoleCounts = {
  general: number;
  domain: number;
  sub: number;
};

type SystemAgentHeroCardProps = {
  agent: Agent;
  counts: AgentRoleCounts;
  busy: boolean;
  t: Translations;
  onToggle: (agent: Agent) => void;
  onOpenSettings: (agent: Agent) => void;
  onNavigate: (tab: "agents-general" | "agents-domain" | "agents-sub") => void;
};

export function SystemAgentHeroCard({
  agent,
  counts,
  busy,
  t,
  onToggle,
  onOpenSettings,
  onNavigate,
}: SystemAgentHeroCardProps) {
  const targets = [
    {
      key: "general",
      label: t.systemAgentGeneralShort,
      title: t.generalAgentPage,
      count: counts.general,
      tab: "agents-general" as const,
    },
    {
      key: "domain",
      label: t.systemAgentDomainShort,
      title: t.domainAgentPage,
      count: counts.domain,
      tab: "agents-domain" as const,
    },
    {
      key: "sub",
      label: t.systemAgentSubShort,
      title: t.subAgentPage,
      count: counts.sub,
      tab: "agents-sub" as const,
    },
  ];

  return (
    <>
      <div className="system-agent-card-main">
        <div className="system-agent-card-identity">
          <span className="system-agent-card-icon">
            <Icon name="router" size={22} />
          </span>
          <div className="system-agent-card-copy">
            <div className="system-agent-card-title">
              <strong>{agent.displayName}</strong>
              <span className="system-agent-role-badge">
                <Icon name="flag" size={13} />
                {t.systemAgentGlobalEntry}
              </span>
              <span className={agent.enabled ? "ok" : "off"}>
                {agent.enabled ? t.enabled : t.disabled}
              </span>
            </div>
            <p
              className="system-agent-card-description"
              title={agent.description || undefined}
            >
              {agent.description || t.noDescription}
            </p>
          </div>
        </div>

        <div className="system-agent-route">
          <div className="system-agent-route-heading">
            <span>{t.systemAgentRouteExits}</span>
            <span>{t.systemAgentRouteTargets(targets.length)}</span>
          </div>
          <div className="system-agent-route-chain">
            <span className="system-agent-route-source">
              <Icon name="router" size={15} />
              {t.systemAgent}
            </span>
            <span className="system-agent-route-arrow">
              <Icon name="chevron-right" size={15} />
            </span>
            <div className="system-agent-route-targets">
              {targets.map((target) => (
                <button
                  key={target.key}
                  type="button"
                  className="system-agent-route-target"
                  title={target.title}
                  aria-label={`${target.title}: ${target.count}`}
                  onClick={() => onNavigate(target.tab)}
                >
                  <span>{target.label}</span>
                  <strong>{target.count}</strong>
                </button>
              ))}
            </div>
          </div>
          <div className="system-agent-card-actions">
            <label
              className="switch agent-card-switch"
              title={agent.enabled ? t.stop : t.enable}
            >
              <input
                type="checkbox"
                role="switch"
                checked={agent.enabled}
                aria-label={agent.enabled ? t.stop : t.enable}
                disabled={busy}
                onChange={() => onToggle(agent)}
              />
              <span className="switch-track" aria-hidden="true" />
            </label>
            <button
              onClick={() => onOpenSettings(agent)}
              className="secondary agent-settings-button"
              disabled={busy}
            >
              <Icon name="settings" size={15} />
              {t.settings}
            </button>
          </div>
        </div>
      </div>
      <div className="system-agent-card-footer">
        <span>
          <Icon name="info" size={13} />
          {t.systemAgentFallback}
        </span>
        <span>
          <Icon name="router" size={13} />
          {t.systemAgentHint}
        </span>
      </div>
    </>
  );
}
