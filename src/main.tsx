import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { apiClient } from "./lib/api";
import { queryClient } from "./query-client";
import { routeTree } from "./routeTree.gen";
import "./styles.css";

// The browser tab title is the App's human-readable name, derived server-side
// from its slug (`/api/config`). It's a document-level, set-once concern, so we
// set it here at the composition root rather than from inside React — no
// `useEffect`, and it doesn't block first paint. If the fetch fails, the static
// title in `index.html` stays.
const setTabTitle = async (): Promise<void> => {
  const res = await apiClient.config.$get();
  if (res.ok) {
    const { appName } = await res.json();
    document.title = appName;
  }
};

void setTabTitle().catch(() => {});

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error('Root element "#root" not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);
