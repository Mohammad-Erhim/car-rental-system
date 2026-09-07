import { cva, type VariantProps } from 'class-variance-authority';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { forwardRef, type HTMLAttributes } from 'react';

import { cn } from '../lib/utils';

const alertVariants = cva(
  'relative w-full rounded-lg border p-4 [&>svg]:absolute [&>svg]:start-4 [&>svg]:top-4 [&>svg]:size-5 [&>svg~*]:ps-8',
  {
    variants: {
      variant: {
        default: 'bg-background text-foreground',
        info: 'border-primary/40 bg-primary/5 text-foreground',
        success: 'border-success/40 bg-success/10 text-foreground',
        warning: 'border-warning/50 bg-warning/10 text-foreground',
        destructive: 'border-destructive/50 bg-destructive/10 text-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

const iconFor = {
  default: Info,
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  destructive: XCircle,
} as const;

export interface AlertProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  /** Set false to render your own icon as the first child. */
  withIcon?: boolean;
}

export const Alert = forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = 'default', withIcon = true, children, ...props }, ref) => {
    const Icon = iconFor[variant ?? 'default'];
    return (
      <div
        ref={ref}
        role={variant === 'destructive' || variant === 'warning' ? 'alert' : 'status'}
        className={cn(alertVariants({ variant }), className)}
        {...props}
      >
        {withIcon && <Icon aria-hidden="true" />}
        {children}
      </div>
    );
  },
);
Alert.displayName = 'Alert';

export const AlertTitle = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h5
      ref={ref}
      className={cn('mb-1 font-medium leading-none tracking-tight', className)}
      {...props}
    />
  ),
);
AlertTitle.displayName = 'AlertTitle';

export const AlertDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('text-sm [&_p]:leading-relaxed', className)} {...props} />
));
AlertDescription.displayName = 'AlertDescription';
