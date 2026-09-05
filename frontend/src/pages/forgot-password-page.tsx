import { zodResolver } from '@hookform/resolvers/zod';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate } from 'react-router-dom';
import { z } from 'zod';
import { Button, Card, Field, Input, StatusMessage } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { authApi } from '@/services/endpoints';

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
});

type FormValues = z.infer<typeof schema>;

export const ForgotPasswordPage = () => {
  const { user } = useAuth();
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  if (user) return <Navigate to="/" replace />;

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await authApi.forgotPassword(values);
      // The API answers the same way for unknown addresses, and so does this screen.
      setSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not send the reset link');
    }
  });

  return (
    <main className="safe-x safe-top safe-bottom flex min-h-screen items-center justify-center px-4 py-8 supports-[height:100dvh]:min-h-[100dvh] sm:p-6">
      <Card className="w-full max-w-sm">
        <h1 className="text-lg font-semibold">Forgot your password?</h1>
        <p className="mb-5 mt-1 text-sm text-muted-foreground">
          Enter your email and we will send you a link to choose a new one.
        </p>

        {sent ? (
          <>
            <StatusMessage tone="success">
              If that email belongs to an account, a reset link is on its way. The link expires in
              30 minutes.
            </StatusMessage>
            <p className="mt-4 text-sm">
              <Link to="/login" className="font-medium underline underline-offset-4">
                Back to sign in
              </Link>
            </p>
          </>
        ) : (
          <form onSubmit={onSubmit} noValidate>
            <Field label="Email" htmlFor="email" required error={errors.email?.message}>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'email-error' : undefined}
                {...register('email')}
              />
            </Field>

            <Button type="submit" className="w-full" loading={isSubmitting}>
              Send reset link
            </Button>

            {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}

            <p className="mt-4 text-sm text-muted-foreground">
              <Link to="/login" className="font-medium underline underline-offset-4">
                Back to sign in
              </Link>
            </p>
          </form>
        )}
      </Card>
    </main>
  );
};
