'use client';

import { Check, CreditCard, Pencil, Plus, Star, Trash2, Users } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { useAdminSession } from '@/components/auth/admin-session';
import { RoleGate } from '@/components/auth/role-gate';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { PageHeader } from '@/components/common/page-header';
import { CardGridSkeleton, EmptyState, ErrorState } from '@/components/common/states';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useDeletePlan, usePlans, useUpdatePlan } from '@/lib/api/plans';
import type { AdminPlan, PlanLimits } from '@/lib/api/types';
import { cn, formatCurrency, formatNumber } from '@/lib/utils';

import { PlanDialog } from './plan-dialog';

const LIMIT_LABELS: Record<keyof PlanLimits, string> = {
  meetingsPerMonth: 'Meetings / month',
  aiQueriesPerDay: 'Ask-AI queries / day',
  uploadMinutesPerMonth: 'Upload minutes / month',
};

function PlanCard({ plan, onEdit }: { plan: AdminPlan; onEdit: (plan: AdminPlan) => void }) {
  const { can } = useAdminSession();
  const toggle = useUpdatePlan({ silent: true });
  const remove = useDeletePlan();
  const blocked = plan.isDefault || plan.usersCount > 0;
  const blockReason = plan.isDefault
    ? 'This is the default plan for new users, so the API will refuse to delete it. Make another plan the default first.'
    : plan.usersCount > 0
      ? `${formatNumber(plan.usersCount)} user${plan.usersCount === 1 ? ' is' : 's are'} on this plan, so the API will refuse to delete it. Move them to another plan or deactivate this one instead.`
      : null;

  return (
    <Card className={cn('relative', plan.isPopular && 'ring-2 ring-primary', !plan.isActive && 'opacity-75')}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
          {plan.name}
          {plan.isPopular ? (
            <Badge className="gap-1">
              <Star /> Popular
            </Badge>
          ) : null}
          {plan.isDefault ? <Badge variant="secondary">Default</Badge> : null}
          {!plan.isActive ? <Badge variant="outline">Inactive</Badge> : null}
        </CardTitle>
        <CardDescription className="font-mono text-xs">{plan.slug}</CardDescription>
        <CardAction>
          <Switch
            checked={plan.isActive}
            disabled={!can('admin') || toggle.isPending}
            aria-label={plan.isActive ? `Deactivate ${plan.name}` : `Activate ${plan.name}`}
            onCheckedChange={(isActive) => toggle.mutate({ id: plan.id, isActive })}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div>
          <p className="text-3xl font-semibold tabular-nums">
            {formatCurrency(plan.priceMonthly, plan.currency)}
            <span className="text-sm font-normal text-muted-foreground"> / month</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {formatCurrency(plan.priceYearly, plan.currency)} / year
          </p>
        </div>
        {plan.description ? <p className="text-sm text-muted-foreground">{plan.description}</p> : null}
        {plan.features.length ? (
          <ul className="space-y-1.5 text-sm">
            {plan.features.map((feature, i) => (
              <li key={`${feature}-${i}`} className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                {feature}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No features listed.</p>
        )}
        <dl className="grid gap-1 rounded-lg bg-muted/50 p-3 text-xs">
          {(Object.keys(LIMIT_LABELS) as (keyof PlanLimits)[]).map((key) => (
            <div key={key} className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{LIMIT_LABELS[key]}</dt>
              <dd className="font-medium tabular-nums">
                {plan.limits[key] === null ? 'Unlimited' : formatNumber(plan.limits[key])}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5" aria-hidden /> {formatNumber(plan.usersCount)} users
          </span>
          {plan.ctaLabel ? <span>Button: “{plan.ctaLabel}”</span> : null}
          <span>Order {plan.sortOrder}</span>
        </div>
      </CardContent>
      <RoleGate minRole="admin">
        <CardFooter className="justify-end gap-1 border-t">
          <Button variant="ghost" size="sm" onClick={() => onEdit(plan)}>
            <Pencil /> Edit
          </Button>
          <ConfirmDialog
            title={`Delete the ${plan.name} plan?`}
            description="The plan disappears from the pricing page and the app."
            confirmLabel="Delete plan"
            destructive
            onConfirm={() => remove.mutateAsync(plan.id)}
            trigger={
              <Button variant="ghost" size="sm" className={cn(blocked && 'text-muted-foreground')}>
                <Trash2 /> Delete
              </Button>
            }
          >
            {blockReason ? (
              <Alert>
                <AlertDescription>{blockReason}</AlertDescription>
              </Alert>
            ) : null}
          </ConfirmDialog>
        </CardFooter>
      </RoleGate>
    </Card>
  );
}

export function PlansView() {
  const plans = usePlans();
  const sorted = useMemo(
    () => (plans.data ? [...plans.data].sort((a, b) => a.sortOrder - b.sortOrder) : []),
    [plans.data],
  );
  const nextSortOrder = sorted.length ? Math.max(...sorted.map((p) => p.sortOrder)) + 1 : 0;
  const [dialog, setDialog] = useState<{ open: boolean; plan: AdminPlan | null; key: number }>({
    open: false,
    plan: null,
    key: 0,
  });
  const openDialog = useCallback(
    (plan: AdminPlan | null) => setDialog((d) => ({ open: true, plan, key: d.key + 1 })),
    [],
  );

  return (
    <>
      <PageHeader
        title="Plans"
        description="Pricing plans shown on the website pricing section and in the app. Limits (null = unlimited) are enforced by the API."
        actions={
          <RoleGate minRole="admin">
            <Button onClick={() => openDialog(null)}>
              <Plus /> New plan
            </Button>
          </RoleGate>
        }
      />
      {plans.isPending ? (
        <CardGridSkeleton count={3} className="[&>*]:h-96" />
      ) : plans.isError ? (
        <ErrorState error={plans.error} onRetry={() => void plans.refetch()} />
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={<CreditCard />}
          title="No plans yet"
          description="Create at least one default plan — new users are assigned to it."
          action={
            <RoleGate minRole="admin">
              <Button onClick={() => openDialog(null)}>
                <Plus /> New plan
              </Button>
            </RoleGate>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((plan) => (
            <PlanCard key={plan.id} plan={plan} onEdit={openDialog} />
          ))}
        </div>
      )}
      <PlanDialog
        key={dialog.key}
        plan={dialog.plan}
        nextSortOrder={nextSortOrder}
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
      />
    </>
  );
}
