import type { Request } from 'express';
import type { AdminRow } from '../../infra/prisma/models';

export interface AuthUser {
  id: string;
}

export interface AppRequest extends Request {
  user?: AuthUser;
  admin?: AdminRow;
}

export interface ClientContext {
  ip: string | null;
  userAgent: string | null;
}

export function clientContext(req: Request): ClientContext {
  const ua = req.headers['user-agent'];
  return { ip: req.ip ?? null, userAgent: typeof ua === 'string' ? ua.slice(0, 500) : null };
}
