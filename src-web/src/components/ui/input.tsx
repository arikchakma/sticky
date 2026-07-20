import * as React from 'react';
import { cn } from '~/lib/classname';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'border-border bg-background placeholder:text-muted-foreground focus:border-ring disabled:bg-muted block h-9 w-full rounded-xl border px-3 py-2 outline-none',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';

export { Input };
