import { useEffect, useState } from "react";
import type { Language } from "../i18n/translations";
import type { Theme } from "../types";

const MIN_PAGE_ZOOM = 75;
const MAX_PAGE_ZOOM = 150;
const PAGE_ZOOM_STEP = 10;
const PAGE_ZOOM_STORAGE_KEY = "admin-page-zoom";

function clampPageZoom(value: number) {
  if (!Number.isFinite(value)) return 100;
  return Math.min(
    MAX_PAGE_ZOOM,
    Math.max(MIN_PAGE_ZOOM, Math.round(value / 5) * 5),
  );
}

export function useAdminPreferences() {
  const [language, setLanguage] = useState<Language>(() =>
    localStorage.getItem("admin-language") === "en" ? "en" : "zh",
  );
  const [theme, setTheme] = useState<Theme>(() =>
    localStorage.getItem("admin-theme") === "light" ? "light" : "dark",
  );
  const [pageZoom, setPageZoom] = useState(() => {
    const stored = localStorage.getItem(PAGE_ZOOM_STORAGE_KEY);
    return stored === null ? 100 : clampPageZoom(Number(stored));
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("admin-sidebar-collapsed") === "true",
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("admin-theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("admin-language", language);
  }, [language]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--admin-page-zoom",
      String(pageZoom / 100),
    );
    const frame = window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event("admin:page-zoom-change"));
    });
    localStorage.setItem(PAGE_ZOOM_STORAGE_KEY, String(pageZoom));
    return () => window.cancelAnimationFrame(frame);
  }, [pageZoom]);

  useEffect(
    () => () => {
      document.documentElement.style.removeProperty("--admin-page-zoom");
    },
    [],
  );

  useEffect(() => {
    const handleZoomShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const increase =
        event.key === "+" || event.key === "=" || event.code === "NumpadAdd";
      const decrease =
        event.key === "-" ||
        event.key === "_" ||
        event.code === "NumpadSubtract";
      const reset = event.key === "0" || event.code === "Numpad0";
      if (!increase && !decrease && !reset) return;
      event.preventDefault();
      if (reset) {
        setPageZoom(100);
        return;
      }
      setPageZoom((current) =>
        clampPageZoom(current + (increase ? PAGE_ZOOM_STEP : -PAGE_ZOOM_STEP)),
      );
    };
    window.addEventListener("keydown", handleZoomShortcut);
    return () => window.removeEventListener("keydown", handleZoomShortcut);
  }, []);

  useEffect(() => {
    localStorage.setItem("admin-sidebar-collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  return {
    language,
    setLanguage,
    theme,
    setTheme,
    pageZoom,
    setPageZoom: (value: number | ((current: number) => number)) =>
      setPageZoom((current) =>
        typeof value === "function"
          ? clampPageZoom(value(current))
          : clampPageZoom(value),
      ),
    sidebarCollapsed,
    setSidebarCollapsed,
    clampPageZoom,
    pageZoomMin: MIN_PAGE_ZOOM,
    pageZoomMax: MAX_PAGE_ZOOM,
    pageZoomStep: PAGE_ZOOM_STEP,
  };
}
