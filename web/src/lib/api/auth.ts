import { api, request } from "./client";
import type { ExchangeResult, Session } from "./types";

export const authApi = {
  /** Trade the one-time OAuth code for a session (the API also sets the web cookies). */
  exchange: (code: string) =>
    request<ExchangeResult>("/auth/exchange", { method: "POST", body: { code }, skipAuthRefresh: true }).then(
      (r) => r.data,
    ),
  me: (signal?: AbortSignal) => api.get<Session>("/auth/me", undefined, signal),
  logout: () => request<void>("/auth/logout", { method: "POST", body: {}, skipAuthRefresh: true }).then(() => undefined),
};
