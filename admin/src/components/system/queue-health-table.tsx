import { StatusBadge } from '@/components/common/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { QueueStats } from '@/lib/api/types';
import { cn, formatNumber } from '@/lib/utils';

import { queueLabel } from './queue-meta';

export function queueStatus(q: QueueStats): { status: string; label: string } {
  if (q.paused) return { status: 'paused', label: 'Paused' };
  if (q.failed > 0) return { status: 'failed', label: `${formatNumber(q.failed)} failed` };
  if (q.active > 0) return { status: 'running', label: 'Running' };
  return { status: 'active', label: 'Healthy' };
}

export function QueueHealthTable({ queues }: { queues: QueueStats[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Queue</TableHead>
          <TableHead className="text-right">Waiting</TableHead>
          <TableHead className="text-right">Active</TableHead>
          <TableHead className="text-right">Delayed</TableHead>
          <TableHead className="text-right">Failed</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {queues.map((q) => {
          const s = queueStatus(q);
          return (
            <TableRow key={q.name}>
              <TableCell className="font-medium">{queueLabel(q.name)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(q.waiting)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(q.active)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(q.delayed)}</TableCell>
              <TableCell className={cn('text-right tabular-nums', q.failed > 0 && 'font-semibold text-destructive')}>
                {formatNumber(q.failed)}
              </TableCell>
              <TableCell>
                <StatusBadge status={s.status} label={s.label} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
