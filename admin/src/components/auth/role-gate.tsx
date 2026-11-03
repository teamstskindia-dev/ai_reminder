'use client';

import type { ReactNode } from 'react';

import type { AdminRole } from '@/lib/api/types';
import { ROLE_LABELS } from '@/lib/roles';

import { useAdminSession } from './admin-session';

interface RoleGateProps {
  minRole: AdminRole;
  children: ReactNode;
  /** `hide` (default) renders the fallback; `disable` renders children inside a disabled fieldset. */
  mode?: 'hide' | 'disable';
  fallback?: ReactNode;
}

/**
 * Hide or disable UI the signed-in admin's role cannot use. The API enforces the same rules — this only
 * keeps the UI honest.
 */
export function RoleGate({ minRole, children, mode = 'hide', fallback = null }: RoleGateProps) {
  const { can } = useAdminSession();
  if (can(minRole)) return <>{children}</>;
  if (mode === 'disable') {
    return (
      <fieldset disabled className="contents" title={`Requires the ${ROLE_LABELS[minRole]} role`}>
        {children}
      </fieldset>
    );
  }
  return <>{fallback}</>;
}
