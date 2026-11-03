import { NotFoundView } from '@/components/common/not-found-view';

/** Rendered inside the admin shell for unknown admin URLs (see [...missing]) and notFound() calls. */
export default function AdminNotFound() {
  return <NotFoundView />;
}
