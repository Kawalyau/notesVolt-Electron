
"use client";

import * as React from 'react';
import { cn } from '@/lib/utils';
import { buttonVariants, type ButtonProps } from '@/components/ui/button';

// This component renders a native <button> element but applies the styles
// from our Button component. This is necessary for compatibility with
// react-to-print, which has issues with ref forwarding in some libraries.
export const PrintButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, children, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      >
        {children}
      </button>
    );
  }
);

PrintButton.displayName = 'PrintButton';
