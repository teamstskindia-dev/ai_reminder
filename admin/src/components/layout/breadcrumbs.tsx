'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment } from 'react';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { humanize, truncate } from '@/lib/utils';

import { useBreadcrumbLabels } from './breadcrumb-context';
import { NON_LINK_SEGMENTS, SEGMENT_LABELS } from './nav-config';

const ID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-|^\d+$/i;

export function Breadcrumbs() {
  const pathname = usePathname();
  const overrides = useBreadcrumbLabels();
  const segments = pathname.split('/').filter(Boolean);

  const crumbs = segments.map((segment, index) => {
    const href = `/${segments.slice(0, index + 1).join('/')}`;
    const label =
      overrides[href] ??
      SEGMENT_LABELS[segment] ??
      (ID_LIKE.test(segment) ? 'Details' : humanize(decodeURIComponent(segment)));
    return { href, label: truncate(label, 40), linkable: !NON_LINK_SEGMENTS.has(segment) };
  });

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem className="hidden sm:inline-flex">
          {crumbs.length === 0 ? (
            <BreadcrumbPage>Dashboard</BreadcrumbPage>
          ) : (
            <BreadcrumbLink asChild>
              <Link href="/">Dashboard</Link>
            </BreadcrumbLink>
          )}
        </BreadcrumbItem>
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <Fragment key={crumb.href}>
              <BreadcrumbSeparator className={index === 0 ? 'hidden sm:block' : undefined} />
              <BreadcrumbItem>
                {last ? (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                ) : crumb.linkable ? (
                  <BreadcrumbLink asChild>
                    <Link href={crumb.href}>{crumb.label}</Link>
                  </BreadcrumbLink>
                ) : (
                  <span>{crumb.label}</span>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
