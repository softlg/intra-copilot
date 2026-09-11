import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Language, Translations } from "../i18n/translations";
import type { Theme } from "../types";
import { loginAdmin } from "../lib/api";
import { Icon } from "./Icon";
import "./LoginScreen.css";

interface LoginScreenProps {
  language: Language;
  theme: Theme;
  t: Translations;
  notice?: string;
  onLanguageChange: (language: Language) => void;
  onThemeChange: (theme: Theme) => void;
  onAuthenticated: (username: string) => void;
}

export function LoginScreen({
  language,
  theme,
  t,
  notice,
  onLanguageChange,
  onThemeChange,
  onAuthenticated,
}: LoginScreenProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!settingsOpen) return undefined;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (
        settingsRef.current &&
        !settingsRef.current.contains(event.target as Node)
      ) {
        setSettingsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSettingsOpen(false);
        settingsButtonRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [settingsOpen]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextUsername = username.trim();
    if (!nextUsername || !password) {
      setError(t.loginFieldsRequired);
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const session = await loginAdmin(nextUsername, password);
      onAuthenticated(session.user.username);
    } catch (loginError) {
      setError(
        loginError instanceof Error ? loginError.message : t.loginFailed,
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-settings" ref={settingsRef}>
        <button
          ref={settingsButtonRef}
          type="button"
          className="settings-button"
          onClick={() => setSettingsOpen((open) => !open)}
          aria-label={t.settings}
          aria-haspopup="dialog"
          aria-expanded={settingsOpen}
          title={t.settings}
        >
          <Icon name="settings" size={18} />
        </button>
        {settingsOpen && (
          <div
            className="settings-popover"
            role="dialog"
            aria-label={t.settings}
          >
            <strong>{t.settings}</strong>
            <span className="settings-label">{t.language}</span>
            <div className="settings-options">
              <button
                type="button"
                className={language === "zh" ? "option active" : "option"}
                onClick={() => onLanguageChange("zh")}
                aria-pressed={language === "zh"}
              >
                {t.chinese}
              </button>
              <button
                type="button"
                className={language === "en" ? "option active" : "option"}
                onClick={() => onLanguageChange("en")}
                aria-pressed={language === "en"}
              >
                {t.english}
              </button>
            </div>
            <span className="settings-label">{t.appearance}</span>
            <div className="settings-options">
              <button
                type="button"
                className={theme === "dark" ? "option active" : "option"}
                onClick={() => onThemeChange("dark")}
                aria-pressed={theme === "dark"}
              >
                {t.dark}
              </button>
              <button
                type="button"
                className={theme === "light" ? "option active" : "option"}
                onClick={() => onThemeChange("light")}
                aria-pressed={theme === "light"}
              >
                {t.light}
              </button>
            </div>
          </div>
        )}
      </div>

      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-brand">
          <span className="login-brand-mark" aria-hidden="true">
            <Icon name="agents" size={24} />
          </span>
          <span>{t.title}</span>
        </div>
        <div className="login-heading">
          <h1 id="login-title">{t.loginTitle}</h1>
          <p>{t.loginSubtitle}</p>
        </div>

        <form className="login-form" onSubmit={submit}>
          <label className="field">
            <span>{t.username}</span>
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder={t.usernamePlaceholder}
              autoComplete="username"
              autoFocus
              required
              disabled={submitting}
            />
          </label>
          <label className="field">
            <span>{t.password}</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t.passwordPlaceholder}
              autoComplete="current-password"
              required
              disabled={submitting}
            />
          </label>

          {notice && !error && (
            <p className="login-notice" role="status">
              {notice}
            </p>
          )}
          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="login-submit"
            disabled={submitting || !username.trim() || !password}
          >
            {submitting ? t.signingIn : t.signIn}
          </button>
        </form>
        <p className="login-hint">{t.loginHint}</p>
      </section>
    </div>
  );
}
