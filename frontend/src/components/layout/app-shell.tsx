import {
  BookOpen,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Monitor,
  Moon,
  PhoneCall,
  Sun,
  Users,
} from 'lucide-react';
import * as React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Avatar,
  AvatarFallback,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { useTheme, type Theme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';

const NAVIGATION = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/calls', label: 'Calls', icon: PhoneCall, end: false },
  { to: '/contacts', label: 'Contacts', icon: Users, end: false },
  { to: '/templates', label: 'Templates', icon: FileText, end: false },
  { to: '/knowledge-bases', label: 'Knowledge Base', icon: BookOpen, end: false },
];

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    // 44px tall so it is comfortably tappable in the drawer.
    'flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-primary/10 text-primary'
      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
  );

const NavItems = () => (
  <ul className="space-y-1">
    {NAVIGATION.map((item) => (
      <li key={item.to}>
        <NavLink to={item.to} end={item.end} className={navLinkClass}>
          {({ isActive }) => (
            <>
              <item.icon className="size-5 shrink-0" aria-hidden="true" />
              <span>{item.label}</span>
              {isActive ? <span className="sr-only">(current page)</span> : null}
            </>
          )}
        </NavLink>
      </li>
    ))}
  </ul>
);

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

const UserMenu = () => {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();

  // Two letters is all that fits, and an email always has a first character.
  const initials = (user?.email ?? '?').slice(0, 2).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account and settings">
          <Avatar>
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <span className="block text-xs text-muted-foreground">Signed in as</span>
          <span className="block truncate font-medium">{user?.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Appearance
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={(next) => setTheme(next as Theme)}>
          {THEME_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              <option.icon className="mr-2 size-4" aria-hidden="true" />
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void logout()}>
          <LogOut aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export const AppShell = () => {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const location = useLocation();

  // Navigating from inside the drawer should leave it behind. Radix handles the
  // focus trap, scroll lock, Escape and overlay dismissal.
  React.useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>

      <header className="safe-top safe-x sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex h-14 items-center justify-between gap-3 px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="-ml-2 lg:hidden"
              aria-label="Open the main menu"
              onClick={() => setMenuOpen(true)}
            >
              <Menu className="size-5" aria-hidden="true" />
            </Button>
            <span className="truncate text-lg font-semibold tracking-tight">VoiceOps</span>
          </div>

          {/* The signed-in email and the sign-out action both live in the account menu,
              so the header stays the same width on a phone as on a desktop. */}
          <UserMenu />
        </div>
      </header>

      {/* Off-canvas navigation, below lg only. */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent
          side="left"
          className="safe-top safe-bottom p-0 lg:hidden"
          // A nav drawer has nothing to describe beyond its title; this tells Radix
          // the omission is deliberate rather than an oversight.
          aria-describedby={undefined}
        >
          <SheetHeader className="h-14 justify-center border-b border-border px-4">
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <nav aria-label="Main" className="flex-1 overflow-y-auto p-3">
            <NavItems />
          </nav>
        </SheetContent>
      </Sheet>

      <div className="flex">
        {/* From lg up the same navigation is a permanent sidebar that tracks the sticky header. */}
        <nav
          aria-label="Main"
          className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 overflow-y-auto border-r border-sidebar-border bg-sidebar p-3 lg:block"
        >
          <NavItems />
        </nav>

        <main id="main" className="safe-x safe-bottom min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6">
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
  // Stacked on a phone so the title keeps its full width and the action is not squeezed;
  // side by side from sm up.
  <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
    <div className="min-w-0">
      <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
    </div>
    {action ? (
      // Actions go full-width on a phone, where a thumb-sized target matters more than density.
      <div className="flex shrink-0 flex-wrap items-center gap-2 [&>a]:w-full sm:[&>a]:w-auto">
        {action}
      </div>
    ) : null}
  </div>
);
