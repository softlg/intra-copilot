/**
 * Custom error thrown by the admin API client. The `message` property
 * is always a user-friendly string (Chinese), so call sites that show
 * `error.message` in a toast or inline error will display the right
 * text. The original backend payload is preserved on `raw` and the
 * HTTP status lives on `status` for callers that need to react
 * programmatically (e.g. open a login dialog on 401).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly raw: string;

  constructor(init: {
    message: string;
    status: number;
    code?: string;
    raw: string;
  }) {
    super(init.message);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.raw = init.raw;
  }
}

interface BackendError {
  error?: string;
  message?: string;
  code?: string;
  detail?: string;
}

/**
 * Parse a backend error response body. The backend may return plain
 * text, a JSON object with `error` / `message` / `code` / `detail`
 * fields, or nothing at all. We try every reasonable shape before
 * giving up.
 */
function parseBackendError(raw: string): BackendError | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return undefined;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as BackendError;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

interface StatusMessageMap {
  readonly zh: string;
  readonly en: string;
}

const NETWORK_ERROR: StatusMessageMap = {
  zh: "无法连接后端服务，请检查网络或后端进程",
  en: "Cannot reach the backend. Check the network or backend process.",
};

const STATUS_FALLBACK: Record<number, StatusMessageMap> = {
  400: { zh: "请求参数有误", en: "Invalid request." },
  401: {
    zh: "登录状态已过期，请重新登录",
    en: "Session expired. Please sign in again.",
  },
  403: {
    zh: "没有权限执行此操作",
    en: "You do not have permission to do that.",
  },
  404: { zh: "资源不存在或已被删除", en: "The resource no longer exists." },
  409: {
    zh: "资源冲突（例如名称重复）",
    en: "Resource conflict (e.g. duplicate name).",
  },
  413: { zh: "上传文件过大", en: "File too large." },
  422: { zh: "提交内容不合法", en: "Submitted content is invalid." },
  429: {
    zh: "请求过于频繁，请稍后再试",
    en: "Too many requests. Try again shortly.",
  },
  500: {
    zh: "服务器内部异常，请稍后重试",
    en: "Internal server error. Try again shortly.",
  },
  502: { zh: "后端网关异常", en: "Bad gateway." },
  503: {
    zh: "服务暂不可用，请稍后重试",
    en: "Service unavailable. Try again shortly.",
  },
  504: { zh: "后端响应超时", en: "Gateway timeout." },
};

/**
 * Build the final user-facing message for a thrown error from
 * `request<T>()`. The fallback is used when the throw was not from
 * our API client (e.g. JSON parse failed locally).
 */
export function describeError(
  error: unknown,
  fallback: { zh: string; en: string },
  language: "zh" | "en",
): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    if (
      error.name === "TypeError" &&
      /fetch|network|failed to fetch/i.test(error.message)
    ) {
      return NETWORK_ERROR[language];
    }
    if (error.message) return error.message;
  }
  return fallback[language];
}

/**
 * Internal: turn a non-OK `Response` into a user-friendly ApiError.
 */
export function buildApiError(
  response: Response,
  raw: string,
  language: "zh" | "en" = "zh",
): ApiError {
  const parsed = parseBackendError(raw);
  const backendMessage =
    parsed?.error?.trim() || parsed?.message?.trim() || parsed?.detail?.trim();
  const statusFallback = STATUS_FALLBACK[response.status];
  const friendly = backendMessage || statusFallback?.[language];
  const message =
    friendly ??
    `请求失败（${response.status}） / Request failed (${response.status})`;
  return new ApiError({
    message,
    status: response.status,
    code: parsed?.code,
    raw,
  });
}

export function isConflict(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409;
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
