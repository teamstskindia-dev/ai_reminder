'use client';

import { useParams } from 'next/navigation';

import { PageEditor } from '@/components/cms/page-editor';
import { ErrorState, FormSkeleton } from '@/components/common/states';
import { useBreadcrumbLabel } from '@/components/layout/breadcrumb-context';
import { useCmsPage } from '@/lib/api/pages';

export function PageEditView() {
  const { id } = useParams<{ id: string }>();
  const page = useCmsPage(id);
  useBreadcrumbLabel(`/content/pages/${id}`, page.data?.title);

  if (page.isPending) return <FormSkeleton />;
  if (page.isError) return <ErrorState error={page.error} onRetry={() => void page.refetch()} />;
  return <PageEditor key={page.data.id} page={page.data} />;
}
