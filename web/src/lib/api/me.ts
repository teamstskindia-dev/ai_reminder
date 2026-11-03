import { api } from "./client";
import type { User, UserSettings } from "./types";

export interface UpdateMeInput {
  name?: string;
  timezone?: string;
  locale?: string;
  onboarded?: true;
}

export const meApi = {
  get: () => api.get<User>("/me"),
  update: (input: UpdateMeInput) => api.patch<User>("/me", input),
  remove: () => api.delete("/me"),
  getSettings: () => api.get<UserSettings>("/me/settings"),
  updateSettings: (input: Partial<UserSettings>) => api.patch<UserSettings>("/me/settings", input),
};
