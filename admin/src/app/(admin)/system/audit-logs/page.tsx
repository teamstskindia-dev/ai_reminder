import type { Metadata } from 'next';

import { AuditLogsView } from './audit-logs-view';

export const metadata: Metadata = { title: 'Audit logs' };

export default function AuditLogsPage() {
  return <AuditLogsView />;
}
