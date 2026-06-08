import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/auth/current-user';
import { AdminShell } from '@/components/ui/admin-shell';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!user.totpEnabled) redirect('/setup-2fa');
  return <AdminShell email={user.email}>{children}</AdminShell>;
}
