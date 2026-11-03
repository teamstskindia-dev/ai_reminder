'use client';

import { Copy, ExternalLink, Globe, Layers, LayoutTemplate, MoreHorizontal, Pencil, Plus, Smartphone, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { useAdminSession } from '@/components/auth/admin-session';
import { RoleGate } from '@/components/auth/role-gate';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { PageHeader } from '@/components/common/page-header';
import { SortableList, useOptimisticOrder } from '@/components/common/sortable-list';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/common/states';
import { StatusBadge } from '@/components/common/status-badge';
import { isSectionPage, PLATFORM_LABELS, SECTION_PAGE_META, sectionSummary } from '@/components/sections/section-meta';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUrlState } from '@/hooks/use-url-state';
import {
  SECTION_PAGES,
  useCreateSection,
  useDeleteSection,
  useReorderSections,
  useSections,
  useUpdateSection,
  type SectionPage,
} from '@/lib/api/sections';
import type { AdminSection, Platform } from '@/lib/api/types';
import { SECTION_TYPE_META } from '@/lib/schemas/sections';
import { cn } from '@/lib/utils';

import { AddSectionDialog } from './add-section-dialog';
import { SafeLink } from '@/components/common/safe-link';

const WEB_URL = (process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const ALL = '__all__';
const PLATFORM_ICONS: Record<Platform, typeof Globe> = { web: Globe, mobile: Smartphone, all: Layers };

const getSectionId = (section: AdminSection) => section.id;

function isPlatform(value: string | null): value is Platform {
  return value === 'web' || value === 'mobile' || value === 'all';
}

interface SectionRowProps {
  section: AdminSection;
  handle: React.ReactNode;
  isDragging: boolean;
  canEdit: boolean;
  activeOverride: boolean | undefined;
  onToggle: (section: AdminSection, active: boolean) => void;
  onDuplicate: (section: AdminSection) => void;
  onDelete: (section: AdminSection) => void;
}

function SectionRow({ section, handle, isDragging, canEdit, activeOverride, onToggle, onDuplicate, onDelete }: SectionRowProps) {
  const PlatformIcon = PLATFORM_ICONS[section.platform];
  const active = activeOverride ?? section.isActive;
  const summary = sectionSummary(section);
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border bg-card p-2.5 pr-3 transition-shadow sm:gap-3',
        isDragging && 'ring-2 ring-primary',
        !active && 'bg-muted/40',
      )}
    >
      {handle}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/content/sections/${section.id}`} className="truncate font-medium hover:underline">
            {section.name}
          </Link>
          <Badge variant="secondary">{SECTION_TYPE_META[section.type]?.label ?? section.type}</Badge>
          <Badge variant="outline" className="gap-1">
            <PlatformIcon className="size-3" aria-hidden /> {PLATFORM_LABELS[section.platform]}
          </Badge>
          {!active ? <StatusBadge status="inactive" label="Hidden" /> : null}
        </div>
        {summary ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{summary}</p> : null}
      </div>
      <Switch
        checked={active}
        disabled={!canEdit}
        onCheckedChange={(checked) => onToggle(section, checked)}
        aria-label={`${active ? 'Hide' : 'Show'} ${section.name}`}
      />
      <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
        <Link href={`/content/sections/${section.id}`}>
          <Pencil /> {canEdit ? 'Edit' : 'View'}
        </Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${section.name}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/content/sections/${section.id}`}>
              <Pencil /> {canEdit ? 'Edit' : 'View'}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canEdit} onSelect={() => onDuplicate(section)}>
            <Copy /> Duplicate
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" disabled={!canEdit} onSelect={() => onDelete(section)}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function SectionsView() {
  const url = useUrlState();
  const { can } = useAdminSession();
  const canEdit = can('editor');
  const viewParam = url.get('view');
  const view: SectionPage = isSectionPage(viewParam) ? viewParam : 'landing';
  const platformParam = url.get('platform');
  const platform = isPlatform(platformParam) ? platformParam : undefined;
  const pageMeta = SECTION_PAGE_META[view];

  const sections = useSections({ page: view, platform });
  const sorted = useMemo(
    () => (sections.data ? [...sections.data].sort((a, b) => a.sortOrder - b.sortOrder) : undefined),
    [sections.data],
  );
  const [ordered, setOrder] = useOptimisticOrder(sorted, getSectionId);

  const reorder = useReorderSections();
  const toggle = useUpdateSection({ silent: true });
  const duplicate = useCreateSection();
  const remove = useDeleteSection();
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<AdminSection | null>(null);

  const dragDisabled = !canEdit || Boolean(platform) || reorder.isPending;

  const onReorder = (next: AdminSection[]) => {
    const previous = ordered;
    setOrder(next);
    reorder.mutate(next.map(getSectionId), { onError: () => setOrder(previous) });
  };

  const onToggle = (section: AdminSection, isActive: boolean) => {
    toggle.mutate(
      { id: section.id, isActive },
      {
        onSuccess: () =>
          toast.success(isActive ? `“${section.name}” is now live` : `“${section.name}” is hidden`),
      },
    );
  };

  const onDuplicate = (section: AdminSection) => {
    duplicate.mutate({
      page: section.page,
      type: section.type,
      name: `${section.name} (copy)`,
      content: structuredClone(section.content),
      platform: section.platform,
      isActive: false,
    });
  };

  const activeOverride = (section: AdminSection): boolean | undefined =>
    toggle.isPending && toggle.variables?.id === section.id ? toggle.variables.isActive : undefined;

  return (
    <>
      <PageHeader
        title="Landing & sections"
        description="Build the website landing, pricing and login pages and the Android onboarding and home screens from ordered content sections."
        actions={
          <>
            {pageMeta.webPath ? (
              <Button variant="outline" asChild>
                <SafeLink href={`${WEB_URL}${pageMeta.webPath}`}>
                  <ExternalLink /> View on site
                </SafeLink>
              </Button>
            ) : null}
            <RoleGate minRole="editor">
              <Button onClick={() => setAdding(true)}>
                <Plus /> Add section
              </Button>
            </RoleGate>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={view} onValueChange={(value) => url.set({ view: value === 'landing' ? null : value })}>
          <div className="max-w-full overflow-x-auto">
            <TabsList aria-label="Page">
              {SECTION_PAGES.map((page) => (
                <TabsTrigger key={page} value={page} className="px-3">
                  {SECTION_PAGE_META[page].label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>
        <Select value={platform ?? ALL} onValueChange={(value) => url.set({ platform: value === ALL ? null : value })}>
          <SelectTrigger className="w-44" aria-label="Platform">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All platforms</SelectItem>
            <SelectItem value="web">Web</SelectItem>
            <SelectItem value="mobile">Mobile</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <p className="mb-3 text-sm text-muted-foreground">
        {pageMeta.description}.{' '}
        {canEdit
          ? platform
            ? 'Clear the platform filter to drag sections into a new order.'
            : 'Drag the handle (or focus it and use Space + arrow keys) to reorder; the new order is live immediately.'
          : 'You have read-only access.'}
      </p>

      {sections.isPending ? (
        <ListSkeleton rows={6} />
      ) : sections.isError ? (
        <ErrorState error={sections.error} onRetry={() => void sections.refetch()} />
      ) : ordered.length === 0 ? (
        <EmptyState
          icon={<LayoutTemplate />}
          title={platform ? `No ${PLATFORM_LABELS[platform].toLowerCase()} sections on this page` : 'No sections on this page yet'}
          description={
            view === 'mobile_onboarding'
              ? 'Add onboarding slides to show them the first time someone opens the app.'
              : 'Add a section to start building this page.'
          }
          action={
            canEdit ? (
              <Button onClick={() => setAdding(true)}>
                <Plus /> Add section
              </Button>
            ) : undefined
          }
        />
      ) : (
        <SortableList
          items={ordered}
          getId={getSectionId}
          onReorder={onReorder}
          disabled={dragDisabled}
          getHandleLabel={(section) => `Reorder ${section.name}`}
          renderItem={(section, { handle, isDragging }) => (
            <SectionRow
              section={section}
              handle={handle}
              isDragging={isDragging}
              canEdit={canEdit}
              activeOverride={activeOverride(section)}
              onToggle={onToggle}
              onDuplicate={onDuplicate}
              onDelete={setDeleting}
            />
          )}
        />
      )}

      <AddSectionDialog page={view} open={adding} onOpenChange={setAdding} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Delete this section?"
        description={
          deleting
            ? `“${deleting.name}” (${SECTION_TYPE_META[deleting.type]?.label ?? deleting.type}) is removed from the ${pageMeta.label.toLowerCase()} immediately. This cannot be undone.`
            : undefined
        }
        confirmLabel="Delete section"
        destructive
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting.id);
        }}
      />
    </>
  );
}
