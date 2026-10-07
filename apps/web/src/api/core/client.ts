import { authBroadcast } from "@/lib/auth-events";
import axios, { AxiosHeaders, type AxiosRequestConfig, type AxiosResponse } from "axios";
import {
clearAuthTokens,
getAuthToken,
setAuthTokens,
} from "./token-storage";
import { getPortalRoleForApiUrl } from "@/lib/portal-role";
import type { ApiSuccessEnvelope,PaginationMeta } from "./types";

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

const axiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "/api/v1",
  withCredentials: true,
  xsrfCookieName: "csrf_token",
  xsrfHeaderName: "x-csrf-token",
});

let csrfInitPromise: Promise<void> | null = null;

const ensureCsrfToken = async () => {
  if (getCsrfToken()) return;
  if (!csrfInitPromise) {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "/api/v1";
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
}

export const getRoleForUrl = (
  url?: string,
): "admin" | "vendor" | "user" | null => {
  const pathname =
    typeof window !== "undefined" ? window.location.pathname : "/";
  return getPortalRoleForApiUrl(url, pathname);
};

/**
 * Single-flight refresh mutexes per role.
 * Guarantees exactly ONE concurrent refresh execution per role across parallel 401s,
 * preventing admin/vendor/user from interfering with each other.
 */
const refreshPromises: Record<string, Promise<RefreshSessionResult> | null> = {
  admin: null,
  vendor: null,
  user: null,
};

export const performTokenRefresh = async (
  hintUrl?: string,
  specificRole?: "admin" | "vendor" | "user"
): Promise<RefreshSessionResult> => {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "/api/v1";
  const role = specificRole || getRoleForUrl(hintUrl) || "user";
  try {
    const csrf = getCsrfToken();
    const headers: Record<string, string> = {};
    if (csrf) {
      headers["x-csrf-token"] = csrf;
    }

    let refreshEndpoint = `${apiUrl}/auth/refresh`;
    if (role === "admin") {
      refreshEndpoint = `${apiUrl}/admin/auth/refresh`;
    } else if (role === "vendor") {
      refreshEndpoint = `${apiUrl}/vendors/auth/refresh`;
    }

    const res = await axios.post(
      refreshEndpoint,
      {},
      {
        withCredentials: true,
        headers,
      }
    );

    const data = res.data?.data || res.data;
    if (data?.accessToken) {
      setAuthTokens(role, {
        accessToken: data.accessToken,
      });
      return {
        success: true,
        accessToken: data.accessToken,
        user: data.user ?? data.vendor,
      };
    }
    return { success: false };
  } catch {
    clearAuthTokens(role);
    authBroadcast.broadcast({ type: "SESSION_EXPIRED", role });
    return { success: false };
  }
};

axiosInstance.interceptors.request.use(async (config) => {
  const method = config.method?.toUpperCase();
  const isMutating =
    method && ["POST", "PUT", "PATCH", "DELETE"].includes(method);

  config.headers = config.headers || {};

  // Attach role-aware access token from memory if present
  const roleContext = getRoleForUrl(config.url);

  const token = roleContext ? getAuthToken(roleContext) : null;
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

    const status = error.response?.status;

    // 403 Forbidden is strictly an Authorization failure. Do NOT attempt refresh loops.
    if (status === 403) {
      return Promise.reject(error);
    }

    const is401 = status === 401;
    const role = getRoleForUrl(originalRequest.url);
    if (!role) return Promise.reject(error);

    const isAuthEndpoint =
      originalRequest.url?.includes("/auth/refresh") ||
      originalRequest.url?.includes("/auth/login") ||
      originalRequest.url?.includes("/auth/register") ||
      false;

    if (is401 && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;

      if (!refreshPromises[role]) {
        refreshPromises[role] = performTokenRefresh(originalRequest.url, role).finally(() => {
          refreshPromises[role] = null;
        });
      }

      const refreshed = await refreshPromises[role];
      if (refreshed?.success && refreshed.accessToken) {
        setHeader(originalRequest.headers, "Authorization", `Bearer ${refreshed.accessToken}`);
        const freshCsrf = getCsrfToken();
        if (freshCsrf) {
          setHeader(originalRequest.headers, "x-csrf-token", freshCsrf);
        }
        return axiosInstance(originalRequest);
      }
    }

    return Promise.reject(error);
  }
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

export const api = {
  get<T, TMeta = PaginationMeta>(url: string, config?: AxiosRequestConfig): Promise<ApiResult<T, TMeta>> {
    return axiosInstance.get(url, config).then((res: AxiosResponse<ApiSuccessEnvelope<T>>) => unwrap<T, TMeta>(res.data));
  },
  post<T, TMeta = PaginationMeta>(
    url: string,
    body?: unknown,
    config?: AxiosRequestConfig
  ): Promise<ApiResult<T, TMeta>> {
    return axiosInstance.post(url, body, config).then((res: AxiosResponse<ApiSuccessEnvelope<T>>) => unwrap<T, TMeta>(res.data));
  },
  put<T, TMeta = PaginationMeta>(
    url: string,
    body?: unknown,
    config?: AxiosRequestConfig
  ): Promise<ApiResult<T, TMeta>> {
    return axiosInstance.put(url, body, config).then((res: AxiosResponse<ApiSuccessEnvelope<T>>) => unwrap<T, TMeta>(res.data));
  },
  patch<T, TMeta = PaginationMeta>(
    url: string,
    body?: unknown,
    config?: AxiosRequestConfig
  ): Promise<ApiResult<T, TMeta>> {
    return axiosInstance.patch(url, body, config).then((res: AxiosResponse<ApiSuccessEnvelope<T>>) => unwrap<T, TMeta>(res.data));
  },
  delete<T = void>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<ApiResult<T>> {
    return axiosInstance.delete(url, config).then((res: AxiosResponse<ApiSuccessEnvelope<T>>) => unwrap<T>(res.data));
  },
};

export type { AxiosRequestConfig };
