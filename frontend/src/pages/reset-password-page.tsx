import { zodResolver } from '@hookform/resolvers/zod';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { Button, Card, Field, Input, StatusMessage } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { authApi } from '@/services/endpoints';

// Kept in step with newPasswordSchema on the backend, which enforces the same rules.
const schema = z
  .object({
    password: z
      .string()
      .min(10, 'Use at least 10 characters')
      .regex(/[a-zA-Z]/, 'Include at least one letter')
      .regex(/[0-9]/, 'Include at least one number'),
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Both passwords must match',
  });

type FormValues = z.infer<typeof schema>;

export const ResetPasswordPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  if (user) return <Navigate to="/" replace />;

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await authApi.resetPassword({ token, password: values.password });
      setDone(true);
      // Give the confirmation a beat to be read before the login screen replaces it.
      setTimeout(() => navigate('/login', { replace: true }), 2000);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not reset your password');
    }
  });

  return (
    <main className="safe-x safe-top safe-bottom flex min-h-screen items-center justify-center px-4 py-8 supports-[height:100dvh]:min-h-[100dvh] sm:p-6">
      <Card className="w-full max-w-sm">
        <h1 className="text-lg font-semibold">Choose a new password</h1>

        {!token ? (
          <>
            <StatusMessage tone="error">
              This reset link is incomplete. Request a new one.
            </StatusMessage>
            <p className="mt-4 text-sm">
              <Link to="/forgot-password" className="font-medium underline underline-offset-4">
                Send a new reset link
              </Link>
            </p>
          </>
        ) : done ? (
          <StatusMessage tone="success">
            Password updated. Taking you to the sign-in screen&hellip;
          </StatusMessage>
        ) : (
          <>
            <p className="mb-5 mt-1 text-sm text-muted-foreground">
              At least 10 characters, with a letter and a number.
            </p>

            <form onSubmit={onSubmit} noValidate>
              <Field
                label="New password"
                htmlFor="password"
                required
                error={errors.password?.message}
              >
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? 'password-error' : undefined}
                  {...register('password')}
                />
              </Field>

              <Field
                label="Confirm new password"
                htmlFor="confirmPassword"
                required
                error={errors.confirmPassword?.message}
              >
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={Boolean(errors.confirmPassword)}
                  aria-describedby={errors.confirmPassword ? 'confirmPassword-error' : undefined}
                  {...register('confirmPassword')}
                />
              </Field>

              <Button type="submit" className="w-full" loading={isSubmitting}>
                Update password
              </Button>

              {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
            </form>
          </>
        )}
      </Card>
    </main>
  );
};
