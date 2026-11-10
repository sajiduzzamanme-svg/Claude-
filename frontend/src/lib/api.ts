"use client";

import useSWR, { mutate as globalMutate, type SWRConfiguration } from "swr";

const BASE = "/api";
const ACCESS = "spaceup.access";
const REFRESH = "spaceup.refresh";

export class ApiError extends Error {
  status: number;
  data: unknown;
  code?: string;
  constructor(status: number, data: unknown) {
    super(describe(data) || `Request failed (${status})`);
    this.status = status;
    this.data = data;
    this.code = (data as { code?: string } | null)?.code;
  }
}

/** Turn any Django REST error body into one readable sentence. */
function describe(data: unknown, prefix = ""): string {
  if (!data) return "";
  if (typeof data === "string") return prefix + data;
  if (Array.isArray(data)) return data.map((d) => describe(d, prefix)).filter(Boolean).join(" ");
  if (typeof data === "object") {
    const o = data as Record<string, unknown>;
    if (typeof o.detail === "string") return o.detail;
    return Object.entries(o)
      .map(([k, v]) => describe(v, k === "non_field_errors" || /^\d+$/.test(k) ? "" : `${k.replace(/_/g, " ")}: `))
      .filter(Boolean)
      .join(" ");
  }
  return String(data);
}

export function errorText(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong.";
}

export const tokens = {
  get access() {
    return typeof window === "undefined" ? null : window.localStorage.getItem(ACCESS);
  },
  set(access: string, refresh?: string) {
    window.localStorage.setItem(ACCESS, access);
    if (refresh) window.localStorage.setItem(REFRESH, refresh);
  },
  clear() {
    window.localStorage.removeItem(ACCESS);
    window.localStorage.removeItem(REFRESH);
  },
};

let refreshing: Promise<boolean> | null = null;
async function refreshAccess(): Promise<boolean> {
  const refresh = window.localStorage.getItem(REFRESH);
  if (!refresh) return false;
  refreshing ??= fetch(`${BASE}/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refresh }),
  })
    .then(async (r) => {
      if (!r.ok) return false;
      tokens.set((await r.json()).access);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function request<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
  const headers: Record<string, string> = {};
  const access = tokens.access;
  if (!access && !path.startsWith("/auth/")) throw new ApiError(401, { detail: "Please sign in." });
  if (access) headers.authorization = `Bearer ${access}`;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, { method, headers, body: payload });
  if (res.status === 401 && retry && path !== "/auth/login") {
    if (await refreshAccess()) return request<T>(method, path, body, false);
    tokens.clear();
    // A full page load on purpose: the session is gone, so no cached state may survive.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    if (!window.location.pathname.startsWith("/login")) window.location.assign("/login");
    throw new ApiError(401, { detail: "Your session has ended. Please sign in again." });
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { detail: res.ok ? "Unexpected response from the server." : `Server error (${res.status}).` };
  }
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
};

export type Paged<T> = { count: number; results: T[] };

const swrDefaults: SWRConfiguration = { revalidateOnFocus: false, keepPreviousData: true, shouldRetryOnError: false };

export function useApi<T>(path: string | null, config?: SWRConfiguration) {
  return useSWR<T, ApiError>(path, (p: string) => api.get<T>(p), { ...swrDefaults, ...config });
}

/** Lists come back either as a plain array or as a paginated envelope; return rows either way. */
export function useList<T>(path: string | null, config?: SWRConfiguration) {
  const res = useSWR<T[] | Paged<T>, ApiError>(path, (p: string) => api.get<T[] | Paged<T>>(p), { ...swrDefaults, ...config });
  const rows: T[] = Array.isArray(res.data) ? res.data : (res.data?.results ?? []);
  return { ...res, rows, loading: res.isLoading };
}

/** After any change, refresh every cached API read so all screens show the same numbers. */
export function refreshAll() {
  return globalMutate(() => true);
}

export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}
