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
        className={cn('h-px bg-zinc-200 w-full', className)}
      />
    );
  }
);

Divider.displayName = 'Divider';
