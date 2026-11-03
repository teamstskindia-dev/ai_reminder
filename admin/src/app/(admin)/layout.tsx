import { AdminSessionProvider } from '@/components/auth/admin-session';
import { AdminShell } from '@/components/layout/admin-shell';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminSessionProvider>
      <AdminShell>{children}</AdminShell>
    </AdminSessionProvider>
  );
}
