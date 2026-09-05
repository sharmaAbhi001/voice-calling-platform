import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * 16px on mobile, 14px from `sm` up: below 16px iOS Safari zooms the page in on
 * any focused field, which leaves half the form off-screen on a phone.
 */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        'flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base shadow-sm transition-colors',
        'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
        'placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
        'sm:h-9 sm:text-sm',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input };
