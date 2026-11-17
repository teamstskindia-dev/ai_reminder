/**
 * The recording currently running in this app process (its clientId), so the upload queue and crash
 * recovery never touch it. Module state: it resets when the app process dies, which is exactly when
 * a "recording" entry in the store must be recovered.
 */
let active: string | null = null;

export function setActiveRecording(clientId: string | null): void {
  active = clientId;
}

export function getActiveRecording(): string | null {
  return active;
}
