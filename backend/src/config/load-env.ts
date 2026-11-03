import { config } from 'dotenv';

/** Loads backend/.env (if present) without overriding variables already set (e.g. by Docker). */
export function loadDotEnv(): void {
  config({ quiet: true });
}
