import { createRootRoute, Outlet } from "@tanstack/react-router";
import { apiClient } from "@/lib/api";

export const Route = createRootRoute({
  // App config is fetched once here, for the whole app: the browser tab title
  // is document-level, and any page can read `appName` via
  // `useLoaderData({ from: "__root__" })`. A failed fetch falls back to the
  // static title in `index.html` instead of blocking the app.
  loader: async (): Promise<{ appName: string }> => {
    const res = await apiClient.config.$get().catch(() => null);

    if (!res?.ok) {
      return { appName: "App" };
    }

    const { appName } = await res.json();
    document.title = appName;
    return { appName };
  },
  component: () => (
    <div className="min-h-screen bg-background">
      <Outlet />
    </div>
  ),
});
