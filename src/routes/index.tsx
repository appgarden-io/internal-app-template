import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useLoaderData } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Reveal } from "@/components/ui/motion";
import { apiClient } from "@/lib/api";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const { appName } = useLoaderData({ from: "__root__" });

  // Threads the whole stack — typed route → `AppStorage` → Durable Object —
  // so the badge below is live proof that storage is wired and migrated.
  const health = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const res = await apiClient.health.$get();
      if (!res.ok) {
        throw new Error(`Health check failed (${res.status})`);
      }
      return res.json();
    },
  });

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col px-6 py-10">
      <Reveal asChild>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">{appName}</CardTitle>
            <CardDescription>
              Ready to build — replace this page in{" "}
              <code>src/routes/index.tsx</code>.
            </CardDescription>
            <div className="pt-1">
              {health.isPending && <Badge variant="outline">Checking…</Badge>}
              {health.isError && (
                <Badge variant="destructive">Storage unreachable</Badge>
              )}
              {health.isSuccess && <Badge>Connected</Badge>}
            </div>
          </CardHeader>
        </Card>
      </Reveal>
    </main>
  );
}
