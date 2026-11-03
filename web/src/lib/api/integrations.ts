import { api } from "./client";
import type { Integration } from "./types";

export const integrationsApi = {
  list: () => api.get<Integration[]>("/integrations"),
  syncGoogleCalendar: () => api.post<{ queued: true }>("/integrations/google-calendar/sync"),
  disconnectGoogleCalendar: () => api.delete("/integrations/google-calendar"),
};
