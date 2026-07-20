import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '~/lib/classname';

const buttonVariants = cva(
  'inline-flex w-full items-center justify-center gap-2 rounded-lg border text-sm font-medium outline-none focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-foreground hover:opacity-80 border-foreground text-background',
        destructive: 'bg-red-500 text-white border-red-400 hover:bg-red-500/90',
        outline:
          'border border-border bg-background hover:bg-muted hover:text-foreground',
        secondary:
          'bg-muted border-border text-foreground hover:bg-border hover:text-foreground',
        ghost:
          'hover:bg-muted border-transparent hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground',
        link: 'text-blue-500 underline underline-offset-4 hover:text-blue-600 hover:no-underline focus:no-underline border-none rounded-none',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 py-2 text-xs',
        lg: 'h-10 rounded-md px-8 py-2',
        icon: 'size-7 shrink-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        type="button"
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
