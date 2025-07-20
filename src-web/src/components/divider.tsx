import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '~/utils/classname';

type DividerProps = HTMLAttributes<HTMLDivElement>;

export const Divider = forwardRef<HTMLDivElement, DividerProps>(
  (props, ref) => {
    const { className, ...rest } = props;
    return (
      <div
        {...rest}
        ref={ref}
        className={cn('h-px w-full bg-zinc-200', className)}
      />
    );
  }
);

Divider.displayName = 'Divider';
