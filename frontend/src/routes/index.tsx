import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { AppShell } from '@/components/layout/app-shell';
import { Spinner } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { CallDetailPage } from '@/pages/calls/call-detail-page';
import { CallsPage } from '@/pages/calls/calls-page';
import { NewCallPage } from '@/pages/calls/new-call-page';
import { ContactsPage } from '@/pages/contacts/contacts-page';
import { DashboardPage } from '@/pages/dashboard/dashboard-page';
import { KnowledgeBaseDetailPage } from '@/pages/knowledge-base/knowledge-base-detail-page';
import { KnowledgeBasesPage } from '@/pages/knowledge-base/knowledge-bases-page';
import { ForgotPasswordPage } from '@/pages/forgot-password-page';
import { LoginPage } from '@/pages/login-page';
import { ResetPasswordPage } from '@/pages/reset-password-page';
import { TemplateEditorPage } from '@/pages/templates/template-editor-page';
import { TemplatesPage } from '@/pages/templates/templates-page';

/** Gate: renders nothing sensitive until the session is known either way. */
const RequireAuth = () => {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Spinner label="Checking your session" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
};

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/', element: <DashboardPage /> },
          { path: '/calls', element: <CallsPage /> },
          { path: '/calls/new', element: <NewCallPage /> },
          { path: '/calls/:id', element: <CallDetailPage /> },
          { path: '/contacts', element: <ContactsPage /> },
          { path: '/templates', element: <TemplatesPage /> },
          { path: '/templates/new', element: <TemplateEditorPage /> },
          { path: '/templates/:id', element: <TemplateEditorPage /> },
          { path: '/knowledge-bases', element: <KnowledgeBasesPage /> },
          { path: '/knowledge-bases/:id', element: <KnowledgeBaseDetailPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
