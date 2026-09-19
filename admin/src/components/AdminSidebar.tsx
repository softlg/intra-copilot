import type { Language, Translations } from "../i18n/translations";
import { Icon, type IconName } from "./Icon";

type AdminSidebarProps = {
  tab: string;
  collapsed: boolean;
  agentMenuOpen: boolean;
  language: Language;
  t: Translations;
  canManageAdmins: boolean;
  onSelect: (tab: string) => void;
  onToggleCollapsed: () => void;
  onToggleAgentMenu: () => void;
};

export function AdminSidebar({
  tab,
  collapsed,
  agentMenuOpen,
  language,
  t,
  canManageAdmins,
  onSelect,
  onToggleCollapsed,
  onToggleAgentMenu,
}: AdminSidebarProps) {
  const navigation: Array<[string, IconName]> = [
    ["knowledge", "knowledge"],
    ["skills", "sparkle"],
    ["mcp-servers", "mcp"],
    ["tools", "tool"],
    ["hooks", "flag"],
    ["ratings", "star"],
    ["conversation-logs", "chat"],
    ["router", "router"],
    ["admin-users", "settings"],
  ].filter(([key]) => key !== "admin-users" || canManageAdmins) as Array<
    [string, IconName]
  >;
  const labels: Record<string, string> = {
    knowledge: t.knowledge,
    "mcp-servers": t.mcpServers,
    tools: t.toolsMenu,
    skills: t.skillsMenu,
    hooks: t.hooksMenu,
    ratings: t.agentRatings,
    "conversation-logs": t.conversationLogs,
    router: t.router,
    "admin-users": language === "zh" ? "管理员" : "Administrators",
  };

  return (
    <aside className={collapsed ? "sidebar-collapsed" : undefined}>
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <h1>{t.title}</h1>
          {!collapsed && <p className="muted">{t.subtitle}</p>}
        </div>
        <button
          className="sidebar-toggle"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? t.expandSidebar : t.collapseSidebar}
          title={collapsed ? t.expandSidebar : t.collapseSidebar}
        >
          <Icon name={collapsed ? "chevron-right" : "chevron-left"} size={16} />
        </button>
      </div>
      <div className="nav-group">
        <div className="nav-row">
          <button
            className={tab === "agents" ? "nav active" : "nav"}
            onClick={() => {
              if (tab === "agents") onToggleAgentMenu();
              else {
                onSelect("agents");
                if (!agentMenuOpen) onToggleAgentMenu();
              }
            }}
            title={collapsed ? t.agents : undefined}
            aria-label={t.agents}
          >
            <span className="nav-icon" aria-hidden="true">
              <Icon name="agents" size={16} />
            </span>
            {!collapsed && <span>{t.agents}</span>}
          </button>
          {!collapsed && (
            <button
              className="nav-caret"
              onClick={onToggleAgentMenu}
              aria-expanded={agentMenuOpen}
              aria-label={t.agentRole}
              title={t.agentRole}
            >
              <Icon
                name={agentMenuOpen ? "chevron-down" : "chevron-right"}
                size={12}
              />
            </button>
          )}
        </div>
        {!collapsed && agentMenuOpen && (
          <div className="nav-sub">
            {(
              [
                ["agents-general", t.generalAgentPage],
                ["agents-domain", t.domainAgentPage],
                ["agents-sub", t.subAgentPage],
              ] as const
            ).map(([key, label]) => (
              <button
                className={
                  tab === key ? "nav nav-sub-item active" : "nav nav-sub-item"
                }
                onClick={() => onSelect(key)}
                aria-label={label}
                key={key}
              >
                <span>{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {navigation.map(([key, icon]) => (
        <button
          className={tab === key ? "nav active" : "nav"}
          onClick={() => onSelect(key)}
          title={collapsed ? labels[key] : undefined}
          aria-label={labels[key]}
          key={key}
        >
          <span className="nav-icon" aria-hidden="true">
            <Icon name={icon} size={16} />
          </span>
          {!collapsed && <span>{labels[key]}</span>}
        </button>
      ))}
    </aside>
  );
}
