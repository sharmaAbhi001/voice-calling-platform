import { Toaster as Sonner, toast } from 'sonner';
import { useTheme } from '@/hooks/use-theme';

/**
 * Toasts for mutation results. A CRM fires a lot of small writes (consent
 * changed, template duplicated, document indexed) that deserve confirmation
 * without a banner shifting the page under the operator.
 */
const Toaster = ({ ...props }: React.ComponentProps<typeof Sonner>) => {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={resolvedTheme}
      className="toaster group"
      position="bottom-right"
      // Clear of the iOS home indicator when it lands bottom-centre on a phone.
      offset={16}
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
          error: 'group-[.toaster]:text-destructive',
          success: 'group-[.toaster]:text-success',
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
