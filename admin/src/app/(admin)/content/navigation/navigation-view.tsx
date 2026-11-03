'use client';

import { ExternalLink, Flag, Navigation, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { useAdminSession } from '@/components/auth/admin-session';
import { RoleGate } from '@/components/auth/role-gate';
import { FEATURE_LABELS } from '@/components/cms/feature-options';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { PageHeader } from '@/components/common/page-header';
import { SortableList, useOptimisticOrder } from '@/components/common/sortable-list';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/common/states';
import { IconPreview } from '@/components/forms/icon-select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUrlState } from '@/hooks/use-url-state';
import { useDeleteNavItem, useNavigation, useReorderNavItems, useUpdateNavItem } from '@/lib/api/navigation';
import type { AdminNavItem, NavLocation } from '@/lib/api/types';
import { cn } from '@/lib/utils';

import { LOCATION_META, NavItemDialog } from './nav-item-dialog';

const LOCATIONS: NavLocation[] = ['header', 'footer', 'sidebar', 'mobile_tab'];

function isLocation(value: string | null): value is NavLocation {
  return value !== null && (LOCATIONS as string[]).includes(value);
}

const getId = (item: AdminNavItem) => item.id;

function NavRow({
  item,
  handle,
  onEdit,
}: {
  item: AdminNavItem;
  handle: React.ReactNode;
  onEdit: (item: AdminNavItem) => void;
}) {
  const { can } = useAdminSession();
  const toggle = useUpdateNavItem({ silent: true });
  const remove = useDeleteNavItem();
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border bg-card p-2 pr-3 shadow-xs',
        !item.isActive && 'bg-muted/40',
      )}
    >
      {handle}
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-background">
        <IconPreview icon={item.icon} className={cn(!item.icon && 'opacity-30')} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('font-medium', !item.isActive && 'text-muted-foreground line-through')}>{item.label}</span>
          {item.groupLabel ? <Badge variant="secondary">{item.groupLabel}</Badge> : null}
          {item.requiredFeature ? (
            <Badge variant="outline" className="gap-1">
              <Flag /> {FEATURE_LABELS[item.requiredFeature] ?? item.requiredFeature}
            </Badge>
          ) : null}
          {item.isExternal ? (
            <Badge variant="outline" className="gap-1">
              <ExternalLink /> External
            </Badge>
          ) : null}
        </div>
        <p className="truncate font-mono text-xs text-muted-foreground">{item.href}</p>
      </div>
      <Switch
        checked={item.isActive}
        disabled={!can('editor') || toggle.isPending}
        aria-label={item.isActive ? `Hide ${item.label}` : `Show ${item.label}`}
        onCheckedChange={(isActive) => toggle.mutate({ id: item.id, isActive })}
      />
      <RoleGate minRole="editor">
        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${item.label}`} onClick={() => onEdit(item)}>
          <Pencil />
        </Button>
        <ConfirmDialog
          title={`Delete “${item.label}”?`}
          description="The link disappears from the website and app on the next config refresh."
          confirmLabel="Delete"
          destructive
          onConfirm={() => remove.mutateAsync(item.id)}
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label={`Delete ${item.label}`}>
              <Trash2 />
            </Button>
          }
        />
      </RoleGate>
    </div>
  );
}

function LocationList({ location, onEdit, onAdd }: { location: NavLocation; onEdit: (item: AdminNavItem) => void; onAdd: () => void }) {
  const { can } = useAdminSession();
  const query = useNavigation(location);
  const reorder = useReorderNavItems();
  const sorted = useMemo(
    () => (query.data ? [...query.data].filter((i) => i.location === location).sort((a, b) => a.sortOrder - b.sortOrder) : undefined),
    [query.data, location],
  );
  const [items, setOrder] = useOptimisticOrder(sorted, getId);

  if (query.isPending) return <ListSkeleton />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Navigation />}
        title={`No ${LOCATION_META[location].label.toLowerCase()} items`}
        description={LOCATION_META[location].description}
        action={
          <RoleGate minRole="editor">
            <Button onClick={onAdd}>
              <Plus /> Add item
            </Button>
          </RoleGate>
        }
      />
    );
  }

  return (
    <SortableList
      items={items}
      getId={getId}
      disabled={!can('editor') || reorder.isPending}
      getHandleLabel={(item) => `Reorder ${item.label}`}
      onReorder={(next) => {
        setOrder(next);
        reorder.mutate(next.map(getId));
      }}
      renderItem={(item, { handle }) => <NavRow item={item} handle={handle} onEdit={onEdit} />}
    />
  );
}

export function NavigationView() {
  const url = useUrlState();
  const raw = url.get('location');
  const location: NavLocation = isLocation(raw) ? raw : 'header';
  const [dialog, setDialog] = useState<{ open: boolean; item: AdminNavItem | null; key: number }>({
    open: false,
    item: null,
    key: 0,
  });
  const openDialog = useCallback(
    (item: AdminNavItem | null) => setDialog((d) => ({ open: true, item, key: d.key + 1 })),
    [],
  );

  return (
    <>
      <PageHeader
        title="Navigation"
        description="Header and footer links on the website, the web app sidebar and the Android app's bottom tabs. Drag to reorder."
        actions={
          <RoleGate minRole="editor">
            <Button onClick={() => openDialog(null)}>
              <Plus /> Add item
            </Button>
          </RoleGate>
        }
      />
      <Tabs value={location} onValueChange={(v) => url.set({ location: v === 'header' ? null : v })}>
        <TabsList className="mb-2 flex-wrap">
          {LOCATIONS.map((loc) => (
            <TabsTrigger key={loc} value={loc}>
              {LOCATION_META[loc].label}
            </TabsTrigger>
          ))}
        </TabsList>
        {LOCATIONS.map((loc) => (
          <TabsContent key={loc} value={loc} className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {LOCATION_META[loc].description} Items with a required feature are hidden while that feature flag is off.
            </p>
            <LocationList location={loc} onEdit={openDialog} onAdd={() => openDialog(null)} />
          </TabsContent>
        ))}
      </Tabs>
      <NavItemDialog
        key={dialog.key}
        location={dialog.item?.location ?? location}
        item={dialog.item}
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
      />
    </>
  );
}
