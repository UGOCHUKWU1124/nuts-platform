import { authBroadcast } from "@/lib/auth-events";
import axios, { AxiosHeaders, type AxiosRequestConfig, type AxiosResponse } from "axios";
import {
  clearAuthTokens,
  getAuthToken,
  isSessionKnownUnauthenticated,
  markSessionUnauthenticated,
  setAuthTokens,
  type AuthRole,
} from "./token-storage";
import type { ApiSuccessEnvelope, PaginationMeta } from "./types";

declare module "axios" {
  interface AxiosRequestConfig {
    authRole?: AuthRole | null;
    _retry?: boolean;
  }

  interface InternalAxiosRequestConfig {
    authRole?: AuthRole | null;
    _retry?: boolean;
  }
}

let inMemoryCsrfToken: string | null = null;

export const getCsrfToken = (): string | null => {
  if (inMemoryCsrfToken) return inMemoryCsrfToken;
  if (typeof document !== "undefined") {
    const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
    if (match?.[1]) {
      inMemoryCsrfToken = decodeURIComponent(match[1]);
      return inMemoryCsrfToken;
    }
  }
  return null;
};

export const setCsrfToken = (token: string | null | undefined) => {
  inMemoryCsrfToken = token || null;
  if (typeof document !== "undefined") {
    if (token) {
      document.cookie = `csrf_token=${encodeURIComponent(token)}; path=/; SameSite=Lax`;
    } else {
      document.cookie = `csrf_token=; Max-Age=0; path=/;`;
    }
  }
};

export const getApiBaseUrl = (): string => {
  if (process.env.NEXT_PUBLIC_API_URL && process.env.NEXT_PUBLIC_API_URL.startsWith("http")) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/+$/, "");
  }
  const backend = process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/+$/, "");
  const prefix = (process.env.NEXT_PUBLIC_API_URL || "/api/v1").replace(/\/+$/, "");
  if (backend && backend.startsWith("http")) {
    return `${backend}${prefix.startsWith("/") ? prefix : `/${prefix}`}`;
  }
  return prefix || "/api/v1";
};

const axiosConfig = {
  baseURL: getApiBaseUrl(),
  withCredentials: true,
  xsrfCookieName: "csrf_token",
  xsrfHeaderName: "x-csrf-token",
} as const;

const axiosInstance = axios.create(axiosConfig);

let csrfInitPromise: Promise<void> | null = null;

const ensureCsrfToken = async () => {
  if (getCsrfToken()) return;
  if (!csrfInitPromise) {
    const apiUrl = getApiBaseUrl();
    csrfInitPromise = axios
      .get(`${apiUrl}/health`, {
        withCredentials: true,
      })
      .then((res) => {
        const token =
          res.headers["x-csrf-token"] || res.headers["X-CSRF-TOKEN"];
        if (token) {
          setCsrfToken(token as string);
        }
      })
      .catch(() => {
        getCsrfToken();
      })
      .finally(() => {
        csrfInitPromise = null;
      });
  }
  await csrfInitPromise;
};

function setHeader(headers: AxiosRequestConfig["headers"], name: string, value: string) {
  if (!headers) return;
  if (headers instanceof AxiosHeaders) {
    headers.set(name, value);
  } else {
    headers[name] = value;
  }
}

function extractHeader(headers: AxiosResponse["headers"] | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const value = headers instanceof AxiosHeaders
    ? headers.get(name)
    : headers[name.toLowerCase()];
  return typeof value === "string" ? value : undefined;
}

export interface RefreshSessionResult {
  success: boolean;
  accessToken?: string;
  user?: unknown;
  reason?: "expired" | "unavailable" | "invalid-response";
}

export class AuthRefreshUnavailableError extends Error {
  constructor() {
    super("Authentication is temporarily unavailable. Please retry.");
    this.name = "AuthRefreshUnavailableError";
  }
}

const refreshPromises: Record<AuthRole, Promise<RefreshSessionResult> | null> = {
  user: null,
  admin: null,
  vendor: null,
};

async function executeTokenRefresh(
  role: AuthRole,
): Promise<RefreshSessionResult> {
  const apiUrl = getApiBaseUrl();
  try {
    const csrf = getCsrfToken();
    const headers: Record<string, string> = {};
    if (csrf) headers["x-csrf-token"] = csrf;

    const refreshEndpoint =
      role === "admin"
        ? `${apiUrl}/admin/auth/refresh`
        : role === "vendor"
          ? `${apiUrl}/vendors/auth/refresh`
          : `${apiUrl}/auth/refresh`;
    const res = await axios.post(
      refreshEndpoint,
      {},
      { withCredentials: true, headers },
    );

    const data = res.data?.data || res.data;
    if (!data?.accessToken) {
      return { success: false, reason: "invalid-response" };
    }

    const user = data.user ?? data.vendor;
    setAuthTokens(role, { accessToken: data.accessToken });
    authBroadcast.publish({ type: "SESSION_REFRESHED", role, user });

    return {
      success: true,
      accessToken: data.accessToken,
      user,
    };
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    if (status === 401 || status === 403) {
      const hadToken = Boolean(getAuthToken(role));
      clearAuthTokens(role);
      markSessionUnauthenticated(role);

      // Only notify other tabs if the user actually had an active session that just expired.
      // An unauthenticated guest checking session MUST NOT trigger SESSION_EXPIRED.
      if (hadToken) {
        authBroadcast.publish({ type: "SESSION_EXPIRED", role });
      }
      return { success: false, reason: "expired" };
    }

    return { success: false, reason: "unavailable" };
  }
}

/**
 * Single-flight refresh lock across tabs and concurrent requests in this tab.
 */
export const performTokenRefresh = (
  role: AuthRole,
): Promise<RefreshSessionResult> => {
  if (isSessionKnownUnauthenticated(role)) {
    return Promise.resolve({ success: false, reason: "expired" });
  }

  const pending = refreshPromises[role];
  if (pending) return pending;

  const runRefresh = () => executeTokenRefresh(role);
  const promise =
    typeof navigator !== "undefined" && navigator.locks
      ? navigator.locks.request(
          `nuts-auth-refresh:${role}`,
          { mode: "exclusive" },
          runRefresh,
        )
      : runRefresh();

  const trackedPromise = promise.finally(() => {
    if (refreshPromises[role] === trackedPromise) {
      refreshPromises[role] = null;
    }
  });

  refreshPromises[role] = trackedPromise;
  return trackedPromise;
};

axiosInstance.interceptors.request.use(async (config) => {
  const method = config.method?.toUpperCase();
  const isMutating =
    method && ["POST", "PUT", "PATCH", "DELETE"].includes(method);

  config.headers = config.headers || {};

  // Attach in-memory access token as Bearer token if present
  const role = config.authRole;
  const token = role ? getAuthToken(role) : null;
  if (token && !extractHeader(config.headers, "Authorization")) {
    setHeader(config.headers, "Authorization", `Bearer ${token}`);
  }

  if (isMutating) {
    let csrf = getCsrfToken();
    if (!csrf && typeof window !== "undefined") {
      await ensureCsrfToken();
      csrf = getCsrfToken();
    }
    if (csrf) {
      setHeader(config.headers, "x-csrf-token", csrf);
    }
  }
  return config;
});

axiosInstance.interceptors.response.use(
  (response) => {
    const token = extractHeader(response.headers, "x-csrf-token");
    if (token) {
      setCsrfToken(token);
    }
    return response;
  },
  async (error) => {
    const token = extractHeader(error.response?.headers, "x-csrf-token");
    if (token) {
      setCsrfToken(token);
    }

    const originalRequest = error.config;
    if (!originalRequest) return Promise.reject(error);

    const role = originalRequest.authRole;
    if (
      error.response?.status !== 401 ||
      !role ||
      originalRequest._retry
    ) {
      return Promise.reject(error);
    }

    if (isSessionKnownUnauthenticated(role)) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;
    const refreshed = await performTokenRefresh(role);
    if (refreshed?.success && refreshed.accessToken) {
      setHeader(
        originalRequest.headers,
        "Authorization",
        `Bearer ${refreshed.accessToken}`,
      );
      const freshCsrf = getCsrfToken();
      if (freshCsrf) {
        setHeader(originalRequest.headers, "x-csrf-token", freshCsrf);
      }
      return axiosInstance(originalRequest);
    }

    if (
      refreshed.reason === "unavailable" ||
      refreshed.reason === "invalid-response"
    ) {
      return Promise.reject(new AuthRefreshUnavailableError());
    }

    return Promise.reject(error);
  },
);

export interface ApiResult<T, TMeta = PaginationMeta> {
  data: T;
  meta?: TMeta;
  message?: string;
}

const isEnvelope = (value: unknown): value is ApiSuccessEnvelope<unknown> =>
  !!value &&
  typeof value === "object" &&
  (value as Record<string, unknown>).success === true &&
  "data" in (value as Record<string, unknown>);

const unwrap = <T, TMeta = PaginationMeta>(payload: unknown): ApiResult<T, TMeta> => {
  if (isEnvelope(payload)) {
    return {
      data: payload.data as T,
      meta: payload.meta as TMeta | undefined,
      message: payload.message,
    };
  }
  // Number/string/blob payloads that bypass the interceptor
  return { data: payload as T };
};

const createApiClient = (authRole: AuthRole | null) => ({
  get<T, TMeta = PaginationMeta>(url: string, config?: AxiosRequestConfig): Promise<ApiResult<T, TMeta>> {
    return axiosInstance.get(url, { ...config, authRole }).then((res: AxiosResponse<ApiSuccessEnvelope<T>>) => unwrap<T, TMeta>(res.data));
  },
  post<T, TMeta = PaginationMeta>(
    url: string,
    body?: unknown,
    config?: AxiosRequestConfig
  ): Promise<ApiResult<T, TMeta>> {
    return axiosInstance.post(url, body, { ...config, authRole }).then((res: AxiosResponse<ApiSuccessEnvelope<T>>) => unwrap<T, TMeta>(res.data));
  },
  put<T, TMeta = PaginationMeta>(
    url: string,
    body?: unknown,
    config?: AxiosRequestConfig
  ): Promise<ApiResult<T, TMeta>> {
    return axiosInstance.put(url, body, { ...config, authRole }).then((res: AxiosResponse<ApiSuccessEnvelope<T>>) => unwrap<T, TMeta>(res.data));
  },
  patch<T, TMeta = PaginationMeta>(
    url: string,
    body?: unknown,
    config?: AxiosRequestConfig
  ): Promise<ApiResult<T, TMeta>> {
    return axiosInstance.patch(url, body, { ...config, authRole }).then((res: AxiosResponse<ApiSuccessEnvelope<T>>) => unwrap<T, TMeta>(res.data));
  },
  delete<T = void>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<ApiResult<T>> {
    return axiosInstance.delete(url, { ...config, authRole }).then((res: AxiosResponse<ApiSuccessEnvelope<T>>) => unwrap<T>(res.data));
  },
});

export const publicApi = createApiClient(null);
export const userApi = createApiClient("user");
export const vendorApi = createApiClient("vendor");
export const adminApi = createApiClient("admin");

export type { AxiosRequestConfig };
