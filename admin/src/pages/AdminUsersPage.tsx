import { useEffect, useState } from "react";
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
  },
} as const;

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function AdminUsersPage({ language }: { language: Language }) {
  const text = copy[language];
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [createRole, setCreateRole] = useState("EDITOR");
  const [saving, setSaving] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState<AdminUser>();
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setUsers(await request<AdminUser[]>("/admin/users"));
    } catch (loadError) {
      setError(messageOf(loadError, text.loadFailed));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const createUser = async () => {
    if (!username.trim() || password.length < 8) return;
    if (password !== confirmPassword) {
      setError(text.passwordMismatch);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await request<AdminUser>("/admin/users", {
        method: "POST",
        body: JSON.stringify({
          username: username.trim(),
          displayName: displayName.trim() || null,
          password,
          enabled: true,
          role: createRole,
        }),
      });
      setCreateOpen(false);
      setUsername("");
      setDisplayName("");
      setPassword("");
      setConfirmPassword("");
      setCreateRole("EDITOR");
      toast.success(text.created);
      await load();
    } catch (createError) {
      setError(messageOf(createError, text.operationFailed));
    } finally {
      setSaving(false);
    }
  };

  const updateUser = async (
    user: AdminUser,
    changes: Partial<Pick<AdminUser, "displayName" | "enabled" | "role">>,
  ) => {
    setSaving(true);
    setError("");
    try {
      await request<AdminUser>(`/admin/users/${user.id}`, {
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
      });
      toast.success(text.updated);
      await load();
    } catch (updateError) {
      setError(messageOf(updateError, text.operationFailed));
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async () => {
    if (!passwordTarget || newPassword.length < 8) return;
    if (newPassword !== confirmNewPassword) {
      setError(text.passwordMismatch);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await request(`/admin/users/${passwordTarget.id}/password`, {
        method: "POST",
        body: JSON.stringify({ password: newPassword }),
      });
      setPasswordTarget(undefined);
      setNewPassword("");
      setConfirmNewPassword("");
      toast.success(text.passwordReset);
    } catch (resetError) {
      setError(messageOf(resetError, text.operationFailed));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="admin-users-page">
      <div className="admin-users-heading">
        <div>
          <h3>{text.title}</h3>
          <p>{text.subtitle}</p>
        </div>
        <button type="button" onClick={() => setCreateOpen(true)}>
          <Icon name="plus" size={15} />
          {text.newUser}
        </button>
      </div>
      <p className="admin-users-hint">
        <Icon name="info" size={14} />
        {text.activeHint}
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
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
      ) : (
        <div className="admin-users-list">
          {users.map((user) => (
            <article className="admin-user-row" key={user.id}>
              <div className="admin-user-identity">
                <span className="admin-user-avatar" aria-hidden="true">
                  {(user.displayName || user.username)
                    .slice(0, 1)
                    .toUpperCase()}
                </span>
                <div>
                  <strong>{user.displayName || user.username}</strong>
                  <code>{user.username}</code>
                </div>
              </div>
              <div className="admin-user-field">
                <span>{text.status}</span>
                <strong className={user.enabled ? "is-enabled" : "is-disabled"}>
                  <Icon name={user.enabled ? "check" : "close"} size={13} />
                  {user.enabled ? text.enabled : text.disabled}
                </strong>
              </div>
              <label className="admin-user-field">
                <span>{text.role}</span>
                <select
                  value={user.role || "EDITOR"}
                  disabled={saving}
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
              <div className="admin-user-field">
                <span>{text.lastLogin}</span>
                <strong>
                  {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "-"}
                </strong>
              </div>
              <div className="admin-user-field">
                <span>{text.updatedAt}</span>
                <strong>{formatDateTime(user.updatedAt)}</strong>
              </div>
              <div className="admin-user-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setPasswordTarget(user)}
                >
                  {text.resetPassword}
                </button>
                <button
                  type="button"
                  className={user.enabled ? "secondary danger" : "secondary"}
                  disabled={saving}
                  onClick={() =>
                    void updateUser(user, { enabled: !user.enabled })
                  }
                >
                  {user.enabled ? text.disable : text.enable}
                </button>
              </div>
            </article>
          ))}
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
