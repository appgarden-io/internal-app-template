import { type ErrorComponentProps, useRouter } from "@tanstack/react-router";
import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";

/**
 * Router-level fallbacks wired into `createRouter` in `src/main.tsx` as
 * `defaultPendingComponent` / `defaultErrorComponent`. Every route that loads
 * data through a loader gets these for free; a route that fetches with
 * react-query renders its own inline ladder instead (see `src/routes/index.tsx`).
 * Keeping them here means new routes stay consistent without copy-paste.
 */

/** Shown while a route (or its loader) is resolving. */
export function RoutePending() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  );
}

/** Shown when a route throws. `reset` re-mounts the route; we also invalidate so
 * the retry actually re-runs any loaders rather than replaying the same error. */
export function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();

  const handleRetry = () => {
    reset();
    void router.invalidate();
  };

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <Empty className="max-w-md border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CircleAlert />
          </EmptyMedia>
          <EmptyTitle>Something went wrong</EmptyTitle>
          <EmptyDescription>{error.message}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button type="button" onClick={handleRetry}>
            Try again
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  );
}
