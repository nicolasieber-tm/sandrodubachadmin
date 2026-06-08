import { Topbar } from './topbar';
import { AdminTabs } from './tabs';

interface AdminShellProps {
  email: string;
  children: React.ReactNode;
}

export function AdminShell({ email, children }: AdminShellProps) {
  return (
    <>
      <Topbar email={email} />
      <AdminTabs />
      <main className="container">
        {children}
      </main>
    </>
  );
}
