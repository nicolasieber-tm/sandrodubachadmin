import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/auth/current-user';
import { AdminShell } from '@/components/ui/admin-shell';
import { ToastProvider } from '@/components/ui/toast';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!user.totpEnabled) redirect('/setup-2fa');
  return (
    <ToastProvider>
      <AdminShell email={user.email}>{children}</AdminShell>
    </ToastProvider>
  );
}
