import { AlertCircleIcon, Loader2Icon, X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '~/lib/classname';
import { headingVariants, type HeadingVariantProps } from './heading';
import { textVariants, type TextVariantProps } from './text';

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/60',
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    closeClassName?: string;
    showCloseButton?: boolean;
    overlayClassName?: string;
  }
>(
  (
    {
      className,
      children,
      closeClassName,
      showCloseButton = true,
      overlayClassName,
      ...props
    },
    ref
  ) => (
    <DialogPortal>
      <DialogOverlay className={overlayClassName} />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed left-[50%] top-[50%] z-50 grid w-full max-w-md translate-x-[-50%] translate-y-[-50%] gap-0 border bg-white p-4 shadow-lg duration-200 sm:rounded-lg',
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            className={cn(
              'absolute right-4 top-4 cursor-pointer rounded-sm opacity-70 ring-offset-white transition-opacity hover:opacity-100 focus:outline-none disabled:pointer-events-none data-[state=open]:bg-white data-[state=open]:text-gray-600',
              closeClassName
            )}
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

const ScrollableDialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    showCloseButton?: boolean;
    closeClassName?: string;
    overlayClassName?: string;
  }
>(
  (
    {
      className,
      children,
      showCloseButton = true,
      closeClassName,
      overlayClassName,
      ...props
    },
    ref
  ) => (
    <DialogPortal>
      <DialogOverlay
        className={cn(
          'grid items-start justify-items-center overflow-y-auto',
          overlayClassName
        )}
      >
        <DialogPrimitive.Content
          ref={ref}
          className={cn(
            'relative grid w-full max-w-lg gap-4 border bg-white p-6 shadow-lg sm:m-4 sm:rounded-lg md:w-full',
            className
          )}
          {...props}
        >
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close
              className={cn(
                'absolute right-4 top-4 cursor-pointer rounded-sm opacity-70 ring-offset-white transition-opacity hover:opacity-100 focus:outline-none disabled:pointer-events-none data-[state=open]:bg-white data-[state=open]:text-gray-600',
                closeClassName
              )}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </DialogOverlay>
    </DialogPortal>
  )
);

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col space-y-1 text-left', className)}
    {...props}
  />
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2',
      className
    )}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title> &
    HeadingVariantProps
>(({ className, size = '6', ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(headingVariants({ size }), className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description> &
    TextVariantProps
>(({ className, size = '3', ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn(textVariants({ size }), 'text-gray-600', className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

type DialogLoadingProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label?: string;
  error?: string | null;
};

export function DialogLoading(props: DialogLoadingProps) {
  const { label = 'Loading...', open, onOpenChange, error } = props;

  const labelText = error ? 'Something went wrong' : label;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-fit border-none px-6 py-2 focus:outline-none sm:rounded-xl"
        showCloseButton={false}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{labelText}</DialogTitle>
          <DialogDescription>{labelText}</DialogDescription>
        </DialogHeader>

        {!error && (
          <div className="flex animate-pulse items-center justify-center gap-2">
            <Loader2Icon className="stroke-3 h-4 w-4 animate-spin" />
            <span className="text-lg font-medium">{labelText}</span>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center gap-2 text-red-500">
            <AlertCircleIcon className="stroke-3 h-4 w-4" />
            <span className="text-lg font-medium">{error}</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
  ScrollableDialogContent,
};
