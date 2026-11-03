import { api } from '../client';
import type {
  Device,
  RegisterDeviceInput,
} from '../types';

export function registerDevice(input: RegisterDeviceInput): Promise<Device> {
  return api<Device>('/devices', { method: 'POST', body: input });
}

export function unregisterDevice(expoPushToken: string): Promise<void> {
  return api<void>(`/devices/${encodeURIComponent(expoPushToken)}`, { method: 'DELETE', timeoutMs: 6_000 });
}
