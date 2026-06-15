import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

const revealVariants = cva(
  "animate-in fade-in fill-mode-both duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:animate-none",
  {
    variants: {
      direction: {
        up: "slide-in-from-bottom-2",
        down: "slide-in-from-top-2",
        left: "slide-in-from-left-2",
        right: "slide-in-from-right-2",
        none: "",
      },
    },
    defaultVariants: {
      direction: "up",
    },
  },
);

type RevealProps = React.ComponentProps<"div"> &
  VariantProps<typeof revealVariants> & {
    /** Render onto the child element instead of a wrapping `<div>`. */
    asChild?: boolean;
    /** Delay before the reveal starts, in milliseconds — use to stagger siblings. */
    delay?: number;
  };

/**
 * Reveals its content with a subtle fade + rise on mount.
 *
 * Pure CSS (via `tw-animate-css`): GPU-composited (`opacity` + `transform`
 * only), interruptible, and automatically disabled under
 * `prefers-reduced-motion`. Override timing through `className`
 * (e.g. `duration-500 ease-out`) — `cn` keeps the last value.
 */
function Reveal({
  className,
  direction,
  asChild = false,
  delay,
  style,
  ...props
}: RevealProps) {
  const Comp = asChild ? Slot.Root : "div";

  return (
    <Comp
      data-slot="reveal"
      className={cn(revealVariants({ direction }), className)}
      style={delay ? { animationDelay: `${delay}ms`, ...style } : style}
      {...props}
    />
  );
}

export { Reveal, revealVariants };
