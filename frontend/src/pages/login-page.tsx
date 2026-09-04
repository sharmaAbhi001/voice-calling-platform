import { zodResolver } from '@hookform/resolvers/zod';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate } from 'react-router-dom';
import { z } from 'zod';
import { Button, Card, Field, Input, StatusMessage } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});

type FormValues = z.infer<typeof schema>;

export const LoginPage = () => {
  const { user, login } = useAuth();
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
      await login(values.email, values.password);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign in failed');
    }
  });

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <h1 className="text-lg font-semibold">Sign in to VoiceOps</h1>
        <p className="mb-5 mt-1 text-sm text-muted-foreground">
          Outbound calling operations console.
        </p>

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

          <Field label="Password" htmlFor="password" required error={errors.password?.message}>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? 'password-error' : undefined}
              {...register('password')}
            />
          </Field>

          <Button type="submit" className="w-full" loading={isSubmitting}>
            Sign in
          </Button>

          {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}

          <p className="mt-4 text-sm text-muted-foreground">
            <Link to="/forgot-password" className="font-medium underline underline-offset-4">
              Forgot your password?
            </Link>
          </p>
        </form>
      </Card>
    </main>
  );
};
