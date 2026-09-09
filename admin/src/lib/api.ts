import { buildApiError } from "./apiError";

export const API =
  import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8080/api/v1";

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw buildApiError(response, detail);
  }

  return response.status === 204 ? (undefined as T) : response.json();
}
