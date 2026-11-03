'use client';

import { CalendarRange, Megaphone, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { useAdminSession } from '@/components/auth/admin-session';
import { RoleGate } from '@/components/auth/role-gate';
import { BannerPreview } from '@/components/cms/banner-preview';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { CardGridSkeleton, EmptyState, ErrorState } from '@/components/common/states';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useUrlState } from '@/hooks/use-url-state';
import { useBanners, useDeleteBanner, useUpdateBanner } from '@/lib/api/banners';
import type { AdminBanner, BannerPlacement, Platform } from '@/lib/api/types';
import { formatDateTime } from '@/lib/utils';

import { BannerDialog } from './banner-dialog';
import { PLACEMENT_LABELS, PLATFORM_LABELS, scheduleState, VARIANT_LABELS } from './banner-schedule';

const PLACEMENT_ORDER: BannerPlacement[] = ['landing_top', 'dashboard', 'mobile_home'];

function BannerCard({ banner, now, onEdit }: { banner: AdminBanner; now: number; onEdit: (b: AdminBanner) => void }) {
  const { can } = useAdminSession();
  const toggle = useUpdateBanner({ silent: true });
  const remove = useDeleteBanner();
  const state = scheduleState(banner, now);
  return (
    <Card className="gap-4 py-4">
      <CardContent className="space-y-4 px-4">
        <div className="rounded-lg border bg-muted/40 p-3">
          <BannerPreview banner={banner} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={state.status} label={state.label} />
          <Badge variant="outline">{PLATFORM_LABELS[banner.platform]}</Badge>
          <Badge variant="outline">{PLACEMENT_LABELS[banner.placement]}</Badge>
          <StatusBadge status={banner.variant} label={VARIANT_LABELS[banner.variant]} dot={false} />
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarRange className="size-3.5 shrink-0" aria-hidden />
          {banner.startsAt || banner.endsAt
            ? `${formatDateTime(banner.startsAt, 'Now')} → ${formatDateTime(banner.endsAt, 'No end')}`
            : 'No schedule — shown while active'}
        </p>
      </CardContent>
      <CardFooter className="justify-between gap-2 border-t px-4 pt-3">
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={banner.isActive}
            disabled={!can('editor') || toggle.isPending}
            onCheckedChange={(isActive) => toggle.mutate({ id: banner.id, isActive })}
            aria-label={banner.isActive ? 'Deactivate banner' : 'Activate banner'}
          />
          Active
        </label>
        <RoleGate minRole="editor">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => onEdit(banner)}>
              <Pencil /> Edit
            </Button>
            <ConfirmDialog
              title="Delete this banner?"
              description={`“${banner.title}” will be removed from ${PLACEMENT_LABELS[banner.placement].toLowerCase()}.`}
              confirmLabel="Delete"
              destructive
              onConfirm={() => remove.mutateAsync(banner.id)}
              trigger={
                <Button variant="ghost" size="icon-sm" aria-label={`Delete ${banner.title}`}>
                  <Trash2 />
                </Button>
              }
            />
          </div>
        </RoleGate>
      </CardFooter>
    </Card>
  );
}

function BannerGrid({ banners, onEdit }: { banners: AdminBanner[]; onEdit: (b: AdminBanner) => void }) {
  // Captured once per mount so the schedule state is stable during render.
  const [now] = useState(() => Date.now());
  const sorted = useMemo(
    () =>
      [...banners].sort(
        (a, b) =>
          PLACEMENT_ORDER.indexOf(a.placement) - PLACEMENT_ORDER.indexOf(b.placement) || a.sortOrder - b.sortOrder,
      ),
    [banners],
  );
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {sorted.map((banner) => (
        <BannerCard key={banner.id} banner={banner} now={now} onEdit={onEdit} />
      ))}
    </div>
  );
}

export function BannersView() {
  const url = useUrlState();
  const platform = (url.get('platform') as Platform | null) ?? undefined;
  const placement = (url.get('placement') as BannerPlacement | null) ?? undefined;
  const banners = useBanners({ platform, placement });
  const [dialog, setDialog] = useState<{ open: boolean; banner: AdminBanner | null; key: number }>({
    open: false,
    banner: null,
    key: 0,
  });
  const openDialog = useCallback(
    (banner: AdminBanner | null) => setDialog((d) => ({ open: true, banner, key: d.key + 1 })),
    [],
  );

  return (
    <>
      <PageHeader
        title="Banners"
        description="Announcements and promos on the landing page, the web dashboard and the Android home screen. Schedule them or switch them off at any time."
        actions={
          <RoleGate minRole="editor">
            <Button onClick={() => openDialog(null)}>
              <Plus /> New banner
            </Button>
          </RoleGate>
        }
      />
      <DataTableToolbar
        url={url}
        search={false}
        filters={[
          {
            key: 'platform',
            label: 'Platforms',
            options: (Object.keys(PLATFORM_LABELS) as Platform[]).map((p) => ({ value: p, label: PLATFORM_LABELS[p] })),
          },
          {
            key: 'placement',
            label: 'Placements',
            options: PLACEMENT_ORDER.map((p) => ({ value: p, label: PLACEMENT_LABELS[p] })),
            className: 'w-52',
          },
        ]}
      />
      {banners.isPending ? (
        <CardGridSkeleton count={3} />
      ) : banners.isError ? (
        <ErrorState error={banners.error} onRetry={() => void banners.refetch()} />
      ) : banners.data.length === 0 ? (
        <EmptyState
          icon={<Megaphone />}
          title={platform || placement ? 'No banners match these filters' : 'No banners yet'}
          description="Create a banner to promote the app, announce features or warn about downtime."
          action={
            <RoleGate minRole="editor">
              <Button onClick={() => openDialog(null)}>
                <Plus /> New banner
              </Button>
            </RoleGate>
          }
        />
      ) : (
        <BannerGrid banners={banners.data} onEdit={openDialog} />
      )}
      <BannerDialog
        key={dialog.key}
        banner={dialog.banner}
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
      />
    </>
  );
}
