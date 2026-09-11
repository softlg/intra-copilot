import { buildApiError } from "./apiError";

export const API =
  import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8080/api/v1";

const AUTH_TOKEN_KEY = "admin-auth-token";

export interface AdminSession {
  token: string;
  expiresAt: string;
  user: {
    username: string;
  };
}

export interface AdminIdentity {
  username: string;
}

export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

export async function apiFetch(
  path: string,
  init?: RequestInit,
  authenticated = true,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (authenticated) {
    const token = getAuthToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API}${path}`, { ...init, headers });
  if (authenticated && response.status === 401) {
    clearAuthToken();
    window.dispatchEvent(new Event("admin:unauthorized"));
  }
  return response;
}

export async function request<T>(
  path: string,
  init?: RequestInit,
  authenticated = true,
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const response = await apiFetch(path, { ...init, headers }, authenticated);

  if (!response.ok) {
    const detail = await response.text();
    throw buildApiError(response, detail);
  }

  return response.status === 204 ? (undefined as T) : response.json();
}

export async function loginAdmin(
  username: string,
  password: string,
): Promise<AdminSession> {
  const session = await request<AdminSession>(
    "/auth/admin/login",
    {
      method: "POST",
      body: JSON.stringify({ username, password }),
    },
    false,
  );
  setAuthToken(session.token);
  return session;
}

export function fetchAdminIdentity(): Promise<AdminIdentity> {
  return request<AdminIdentity>("/auth/admin/session");
}
