import {
  BookOpen,
  FileText,
  LayoutDashboard,
  LogOut,
  PhoneCall,
  Users,
} from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { Button } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

const NAVIGATION = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/calls', label: 'Calls', icon: PhoneCall, end: false },
  { to: '/contacts', label: 'Contacts', icon: Users, end: false },
  { to: '/templates', label: 'Templates', icon: FileText, end: false },
  { to: '/knowledge-bases', label: 'Knowledge Base', icon: BookOpen, end: false },
];

export const AppShell = () => {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>

      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <span className="text-lg font-semibold tracking-tight">VoiceOps</span>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{user?.email}</span>
          <Button variant="outline" size="sm" onClick={() => void logout()}>
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </Button>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-57px)]">
        <nav aria-label="Main" className="w-56 shrink-0 border-r border-border p-3">
          <ul className="space-y-1">
            {NAVIGATION.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium',
                      isActive
                        ? 'bg-secondary text-secondary-foreground'
                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <item.icon className="h-4 w-4" aria-hidden="true" />
                      <span>{item.label}</span>
                      {isActive ? <span className="sr-only">(current page)</span> : null}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <main id="main" className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export const PageHeader = ({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) => (
  <div className="mb-6 flex items-start justify-between gap-4">
    <div>
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
    </div>
    {action}
  </div>
);
