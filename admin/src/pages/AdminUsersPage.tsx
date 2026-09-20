import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";
import { Skeleton } from "../components/Skeleton";
import { toast } from "../components/Toast";
import type { Language } from "../i18n/translations";
import { request } from "../lib/api";
import { formatDateTime } from "../lib/format";
import "./AdminUsersPage.css";

type AdminUser = {
  id: string;
  username: string;
  displayName?: string;
  enabled: boolean;
  role?: "VIEWER" | "EDITOR" | "ADMIN" | "OWNER" | string;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
};

const copy = {
  zh: {
    title: "管理员管理",
    subtitle:
      "账号只用于登录、会话隔离和操作归属；Agent 与资源仍由所有管理员共享。",
    newUser: "新建管理员",
    username: "用户名",
    displayName: "显示名称",
    status: "状态",
    role: "角色",
    lastLogin: "最近登录",
    updatedAt: "最近修改",
    enabled: "已启用",
    disabled: "已停用",
    enable: "启用",
    disable: "停用",
    resetPassword: "重置密码",
    password: "新密码",
    passwordHint: "至少 8 位，不会在界面中再次展示。",
    confirmPassword: "确认密码",
    passwordMismatch: "两次输入的密码不一致。",
    create: "创建账号",
    save: "保存",
    saving: "保存中…",
    cancel: "取消",
    close: "关闭",
    noUsers: "暂无管理员账号。",
    loadFailed: "管理员列表加载失败。",
    createTitle: "新建管理员",
    resetTitle: "重置管理员密码",
    created: "管理员账号已创建。",
    updated: "管理员账号已更新。",
    passwordReset: "密码已重置。",
    operationFailed: "操作失败，请稍后重试。",
    activeHint: "至少保留一个启用的管理员账号。",
    total: "账号总数",
    ownerCount: "OWNER",
    searchPlaceholder: "搜索用户名或显示名称",
    allStatuses: "全部状态",
    noResults: "没有匹配的管理员账号。",
    noResultsHint: "调整搜索关键词或状态筛选后重试。",
    lastOwnerHint: "系统至少需要保留一个启用的 OWNER 账号。",
  },
  en: {
    title: "Administrators",
    subtitle:
      "Accounts control login, private sessions, and attribution. Agents and resources are shared.",
    newUser: "New administrator",
    username: "Username",
    displayName: "Display name",
    status: "Status",
    role: "Role",
    lastLogin: "Last login",
    updatedAt: "Last modified",
    enabled: "Enabled",
    disabled: "Disabled",
    enable: "Enable",
    disable: "Disable",
    resetPassword: "Reset password",
    password: "New password",
    passwordHint: "At least 8 characters. It will not be shown again.",
    confirmPassword: "Confirm password",
    passwordMismatch: "The passwords do not match.",
    create: "Create account",
    save: "Save",
    saving: "Saving…",
    cancel: "Cancel",
    close: "Close",
    noUsers: "No administrator accounts.",
    loadFailed: "Unable to load administrators.",
    createTitle: "New administrator",
    resetTitle: "Reset administrator password",
    created: "Administrator created.",
    updated: "Administrator updated.",
    passwordReset: "Password reset.",
    operationFailed: "Operation failed. Try again.",
    activeHint: "At least one administrator must remain enabled.",
    total: "Total accounts",
    ownerCount: "OWNER",
    searchPlaceholder: "Search username or display name",
    allStatuses: "All statuses",
    noResults: "No matching administrators.",
    noResultsHint: "Adjust the search or status filter and try again.",
    lastOwnerHint: "At least one enabled OWNER account is required.",
  },
} as const;

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function AdminUsersPage({ language }: { language: Language }) {
  const text = copy[language];
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [createRole, setCreateRole] = useState("EDITOR");
  const [passwordTarget, setPasswordTarget] = useState<AdminUser>();
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "enabled" | "disabled"
  >("all");

  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => request<AdminUser[]>("/admin/users"),
  });
  const users = usersQuery.data ?? [];
  const loading = usersQuery.isPending;
  const queryError = usersQuery.error
    ? messageOf(usersQuery.error, text.loadFailed)
    : "";
  const normalizedQuery = query.trim().toLowerCase();
  const visibleUsers = users.filter((user) => {
    const matchesQuery =
      !normalizedQuery ||
      user.username.toLowerCase().includes(normalizedQuery) ||
      (user.displayName ?? "").toLowerCase().includes(normalizedQuery) ||
      (user.role ?? "").toLowerCase().includes(normalizedQuery);
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "enabled" ? user.enabled : !user.enabled);
    return matchesQuery && matchesStatus;
  });
  const enabledOwnerCount = users.filter(
    (user) => user.enabled && user.role === "OWNER",
  ).length;
  const enabledCount = users.filter((user) => user.enabled).length;
  const ownerCount = users.filter((user) => user.role === "OWNER").length;

  const createMutation = useMutation({
    mutationFn: () =>
      request<AdminUser>("/admin/users", {
        method: "POST",
        body: JSON.stringify({
          username: username.trim(),
          displayName: displayName.trim() || null,
          password,
          enabled: true,
          role: createRole,
        }),
      }),
    onSuccess: async () => {
      setCreateOpen(false);
      setUsername("");
      setDisplayName("");
      setPassword("");
      setConfirmPassword("");
      setCreateRole("EDITOR");
      toast.success(text.created);
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (createError) =>
      setError(messageOf(createError, text.operationFailed)),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      user,
      changes,
    }: {
      user: AdminUser;
      changes: Partial<Pick<AdminUser, "displayName" | "enabled" | "role">>;
    }) =>
      request<AdminUser>(`/admin/users/${user.id}`, {
        method: "PUT",
        body: JSON.stringify({
          displayName:
            changes.displayName === undefined
              ? user.displayName || null
              : changes.displayName,
          enabled:
            changes.enabled === undefined ? user.enabled : changes.enabled,
          role: changes.role === undefined ? user.role : changes.role,
        }),
      }),
    onSuccess: async () => {
      toast.success(text.updated);
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (updateError) =>
      setError(messageOf(updateError, text.operationFailed)),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: () =>
      request(`/admin/users/${passwordTarget?.id}/password`, {
        method: "POST",
        body: JSON.stringify({ password: newPassword }),
      }),
    onSuccess: () => {
      setPasswordTarget(undefined);
      setNewPassword("");
      setConfirmNewPassword("");
      toast.success(text.passwordReset);
    },
    onError: (resetError) =>
      setError(messageOf(resetError, text.operationFailed)),
  });

  const createUser = async () => {
    if (!username.trim() || password.length < 8) return;
    if (password !== confirmPassword) {
      setError(text.passwordMismatch);
      return;
    }
    setError("");
    await createMutation.mutateAsync();
  };

  const updateUser = async (
    user: AdminUser,
    changes: Partial<Pick<AdminUser, "displayName" | "enabled" | "role">>,
  ) => {
    setError("");
    await updateMutation.mutateAsync({ user, changes });
  };

  const resetPassword = async () => {
    if (!passwordTarget || newPassword.length < 8) return;
    if (newPassword !== confirmNewPassword) {
      setError(text.passwordMismatch);
      return;
    }
    setError("");
    await resetPasswordMutation.mutateAsync();
  };

  const saving =
    createMutation.isPending ||
    updateMutation.isPending ||
    resetPasswordMutation.isPending;

  return (
    <section className="admin-users-page">
      <div className="admin-users-toolbar">
        <div className="admin-users-intro">
          <p>{text.subtitle}</p>
          <div className="admin-users-stats">
            <span>
              {text.total}
              <strong>{users.length}</strong>
            </span>
            <span>
              {text.enabled}
              <strong>{enabledCount}</strong>
            </span>
            <span>
              {text.ownerCount}
              <strong>{ownerCount}</strong>
            </span>
          </div>
        </div>
        <div className="resource-toolbar-actions">
          <label className="resource-search admin-users-search">
            <Icon name="search" size={15} />
            <span className="sr-only">{text.searchPlaceholder}</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={text.searchPlaceholder}
              type="search"
            />
          </label>
          <select
            className="resource-filter"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value as "all" | "enabled" | "disabled",
              )
            }
            aria-label={text.status}
          >
            <option value="all">{text.allStatuses}</option>
            <option value="enabled">{text.enabled}</option>
            <option value="disabled">{text.disabled}</option>
          </select>
          <button type="button" onClick={() => setCreateOpen(true)}>
            <Icon name="plus" size={15} />
            {text.newUser}
          </button>
        </div>
      </div>
      <p className="admin-users-policy">
        <Icon name="info" size={14} />
        {text.activeHint}
      </p>
      {(error || queryError) && (
        <p className="error" role="alert">
          {error || queryError}
        </p>
      )}
      {loading ? (
        <Skeleton.CardList count={4} />
      ) : users.length === 0 ? (
        <EmptyState
          icon={<Icon name="settings" size={22} />}
          title={text.noUsers}
          action={
            <button type="button" onClick={() => setCreateOpen(true)}>
              {text.newUser}
            </button>
          }
        />
      ) : visibleUsers.length === 0 ? (
        <EmptyState
          compact
          icon={<Icon name="search" size={22} />}
          title={text.noResults}
          hint={text.noResultsHint}
        />
      ) : (
        <div className="admin-users-list">
          {visibleUsers.map((user) => {
            const isLastEnabledOwner =
              user.enabled && user.role === "OWNER" && enabledOwnerCount <= 1;
            return (
              <article className="admin-user-row" key={user.id}>
                <div className="admin-user-identity">
                  <span className="admin-user-avatar" aria-hidden="true">
                    {(user.displayName || user.username)
                      .slice(0, 1)
                      .toUpperCase()}
                  </span>
                  <div className="admin-user-copy">
                    <strong>{user.displayName || user.username}</strong>
                    <div className="admin-user-identity-meta">
                      <code>{user.username}</code>
                      <span
                        className={
                          user.enabled
                            ? "admin-user-status is-enabled"
                            : "admin-user-status is-disabled"
                        }
                      >
                        <Icon
                          name={user.enabled ? "check" : "close"}
                          size={12}
                        />
                        {user.enabled ? text.enabled : text.disabled}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="admin-user-details">
                  <label className="admin-user-detail">
                    <span>{text.role}</span>
                    <select
                      value={user.role || "EDITOR"}
                      disabled={saving || isLastEnabledOwner}
                      title={
                        isLastEnabledOwner ? text.lastOwnerHint : undefined
                      }
                      onChange={(event) =>
                        void updateUser(user, { role: event.target.value })
                      }
                    >
                      <option value="VIEWER">VIEWER</option>
                      <option value="EDITOR">EDITOR</option>
                      <option value="ADMIN">ADMIN</option>
                      <option value="OWNER">OWNER</option>
                    </select>
                  </label>
                  <div className="admin-user-detail">
                    <span>{text.lastLogin}</span>
                    <strong>
                      {user.lastLoginAt
                        ? formatDateTime(user.lastLoginAt)
                        : "-"}
                    </strong>
                  </div>
                  <div className="admin-user-detail">
                    <span>{text.updatedAt}</span>
                    <strong>{formatDateTime(user.updatedAt)}</strong>
                  </div>
                </div>
                <div className="admin-user-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setPasswordTarget(user)}
                  >
                    <Icon name="edit" size={14} />
                    {text.resetPassword}
                  </button>
                  <button
                    type="button"
                    className={user.enabled ? "secondary danger" : "secondary"}
                    disabled={saving || isLastEnabledOwner}
                    title={isLastEnabledOwner ? text.lastOwnerHint : undefined}
                    onClick={() =>
                      void updateUser(user, { enabled: !user.enabled })
                    }
                  >
                    {user.enabled ? text.disable : text.enable}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {createOpen && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal admin-user-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-user-create-title"
          >
            <div className="modal-header">
              <div>
                <h3 id="admin-user-create-title">{text.createTitle}</h3>
                <p className="modal-subtitle">{text.passwordHint}</p>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setCreateOpen(false)}
                disabled={saving}
                aria-label={text.close}
              >
                <Icon name="close" size={18} />
              </button>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void createUser();
              }}
            >
              <label className="field">
                <span>{text.username}</span>
                <input
                  autoFocus
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  pattern="[A-Za-z0-9_.-]{3,64}"
                  required
                />
              </label>
              <label className="field">
                <span>{text.displayName}</span>
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  maxLength={160}
                />
              </label>
              <label className="field">
                <span>{text.role}</span>
                <select
                  value={createRole}
                  onChange={(event) => setCreateRole(event.target.value)}
                >
                  <option value="VIEWER">VIEWER</option>
                  <option value="EDITOR">EDITOR</option>
                  <option value="ADMIN">ADMIN</option>
                  <option value="OWNER">OWNER</option>
                </select>
              </label>
              <label className="field">
                <span>{text.password}</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={8}
                  required
                />
              </label>
              <label className="field">
                <span>{text.confirmPassword}</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  minLength={8}
                  required
                />
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setCreateOpen(false)}
                  disabled={saving}
                >
                  {text.cancel}
                </button>
                <button
                  type="submit"
                  disabled={
                    saving || username.trim().length < 3 || password.length < 8
                  }
                >
                  {saving ? text.saving : text.create}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {passwordTarget && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal admin-user-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-user-password-title"
          >
            <div className="modal-header">
              <div>
                <h3 id="admin-user-password-title">{text.resetTitle}</h3>
                <p className="modal-subtitle">
                  {passwordTarget.displayName || passwordTarget.username}
                </p>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setPasswordTarget(undefined)}
                disabled={saving}
                aria-label={text.close}
              >
                <Icon name="close" size={18} />
              </button>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void resetPassword();
              }}
            >
              <label className="field">
                <span>{text.password}</span>
                <input
                  autoFocus
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  minLength={8}
                  required
                />
              </label>
              <label className="field">
                <span>{text.confirmPassword}</span>
                <input
                  type="password"
                  value={confirmNewPassword}
                  onChange={(event) =>
                    setConfirmNewPassword(event.target.value)
                  }
                  minLength={8}
                  required
                />
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setPasswordTarget(undefined)}
                  disabled={saving}
                >
                  {text.cancel}
                </button>
                <button
                  type="submit"
                  disabled={saving || newPassword.length < 8}
                >
                  {saving ? text.saving : text.resetPassword}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
