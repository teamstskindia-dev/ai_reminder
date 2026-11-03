import { api } from "./client";
import type { Device } from "./types";

export const devicesApi = {
  list: () => api.get<Device[]>("/devices"),
  remove: (expoPushToken: string) => api.delete(`/devices/${encodeURIComponent(expoPushToken)}`),
};
