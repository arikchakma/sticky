import * as React from 'react';
import { cn } from '~/lib/classname';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'block h-9 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 outline-none placeholder:text-zinc-400 focus:border-zinc-500 disabled:bg-zinc-50',
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
