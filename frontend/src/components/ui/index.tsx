import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Small shadcn/ui-style primitive set, written in-repo so the project has no
 * dependency on running the shadcn CLI. Same API shape (className passthrough,
 * cva variants), so generated shadcn components can be dropped in beside them.
 */

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline: 'border border-input bg-background hover:bg-secondary',
        ghost: 'hover:bg-secondary',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 px-3',
        lg: 'h-11 px-6',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

/** For react-router <Link>s that should look like buttons without nesting one. */
export const linkButtonClass = (
  options: VariantProps<typeof buttonVariants> = {},
): string => buttonVariants(options);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      // Announce the busy state instead of relying on the spinner alone.
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'flex min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = 'Select';

export const Label = ({
  className,
  children,
  required,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) => (
  <label className={cn('mb-1.5 block text-sm font-medium', className)} {...props}>
    {children}
    {required ? (
      <span className="ml-1 text-destructive" aria-hidden="true">
        *
      </span>
    ) : null}
  </label>
);

export const Field = ({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) => (
  <div className="mb-4">
    <Label htmlFor={htmlFor} required={required}>
      {label}
    </Label>
    {children}
    {hint && !error ? (
      <p id={`${htmlFor}-hint`} className="mt-1 text-xs text-muted-foreground">
        {hint}
      </p>
    ) : null}
    {error ? (
      <p id={`${htmlFor}-error`} role="alert" className="mt-1 text-xs font-medium text-destructive">
        {error}
      </p>
    ) : null}
  </div>
);

export const Card = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('rounded-lg border border-border bg-card p-5 shadow-sm', className)} {...props} />
);

export const CardTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h2 className={cn('mb-3 text-base font-semibold', className)} {...props} />
);

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
  {
    variants: {
      tone: {
        neutral: 'border-border bg-secondary text-secondary-foreground',
        success: 'border-transparent bg-success text-success-foreground',
        warning: 'border-transparent bg-warning text-warning-foreground',
        danger: 'border-transparent bg-destructive text-destructive-foreground',
        info: 'border-transparent bg-primary text-primary-foreground',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

/**
 * Status is always spelled out in words. Colour is a secondary signal only, so
 * the UI stays readable for colour-blind users and in greyscale.
 */
export const Badge = ({
  className,
  tone,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) => (
  <span className={cn(badgeVariants({ tone }), className)} {...props}>
    {children}
  </span>
);

export const Spinner = ({ label = 'Loading' }: { label?: string }) => (
  <div role="status" className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
    <span>{label}…</span>
  </div>
);

export const EmptyState = ({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) => (
  <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
    <p className="text-sm font-semibold">{title}</p>
    <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
    {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
  </div>
);

export const ErrorState = ({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) => (
  <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
    <p className="text-sm font-semibold text-destructive">Something went wrong</p>
    <p className="mt-1 text-sm text-muted-foreground">
      {error instanceof Error ? error.message : 'Please try again.'}
    </p>
    {onRetry ? (
      <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
        Try again
      </Button>
    ) : null}
  </div>
);

/** Live region so async results are announced, not just shown. */
export const StatusMessage = ({ tone, children }: { tone: 'success' | 'error'; children: React.ReactNode }) => (
  <p
    role="status"
    aria-live="polite"
    className={cn(
      'mt-3 rounded-md px-3 py-2 text-sm',
      tone === 'success'
        ? 'bg-success/10 text-success'
        : 'bg-destructive/10 text-destructive',
    )}
  >
    {children}
  </p>
);

export const Table = ({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) => (
  <div className="w-full overflow-x-auto">
    <table className={cn('w-full border-collapse text-left text-sm', className)} {...props} />
  </div>
);

export const Th = ({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
  <th
    scope="col"
    className={cn('border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground', className)}
    {...props}
  />
);

export const Td = ({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn('border-b border-border px-3 py-3 align-middle', className)} {...props} />
);
