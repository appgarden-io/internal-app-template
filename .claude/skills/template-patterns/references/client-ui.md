# Client & UI — the typed `apiClient`, TanStack, shadcn/ui

## Shape and why

`src/lib/api.ts` creates the one API client the SPA uses:

```ts
// Typed against the full route surface (`ApiRoutes`), so every request,
// response, and path param below is checked end-to-end — no `fetch`, no casts.
export const apiClient = hc<ApiRoutes>("/api");
```

- **Never raw `fetch`.** Every API call goes through `apiClient` — it carries
  the route types, so a wrong path, body, or response access fails typecheck.
- **Call `apiClient` directly in the `queryFn` / `mutationFn` / route loader.**
  Don't add a per-endpoint wrapper function layer in `api.ts` — a wrapper whose
  interface is as wide as its body adds nothing the typed client doesn't
  already guarantee. Keep the read/write path in the module that uses it.
- **`res.ok` narrows the response union.** After the check, `.json()` is typed
  to the success branch — no cast needed.

Row types come from `worker/schema.ts` via `import type` (erased at build, so
no Worker code enters the browser bundle). Import them; never redefine them.

## Worked example

Reading and mutating through the client (adapted from the original notes
feature) — `apiClient` is called inline where the data is used, not wrapped in
a helper:

```tsx
export const Route = createFileRoute("/")({
  loader: async () => {
    const res = await apiClient.notes.$get();
    if (!res.ok) {
      throw new Error(`Failed to load notes (${res.status})`);
    }

    const { notes } = await res.json();
    return notes;
  },
  component: HomePage,
});

// In a component: a mutation posting through the client. `res.ok` narrows the
// response union to the 201 branch, so `.json()` is typed `{ note: Note }` —
// no cast.
const createNote = useMutation({
  mutationFn: async (text: string) => {
    const res = await apiClient.notes.$post({ json: { text } });
    if (!res.ok) {
      throw new Error(`Failed to create note (${res.status})`);
    }

    const { note } = await res.json();
    return note;
  },
  onSuccess: () => router.invalidate(),
});
```

Rendering loaded rows with TanStack Table (trimmed from the original notes
page):

```tsx
function HomePage() {
  const notes = Route.useLoaderData();

  const columns = useMemo<ColumnDef<Note>[]>(
    () => [
      {
        accessorKey: "text",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Note" />
        ),
        cell: ({ row }) => (
          <span className="font-medium">{row.original.text}</span>
        ),
      },
    ],
    [],
  );

  return notes.length === 0 ? (
    <p className="text-sm text-muted-foreground">No notes yet.</p>
  ) : (
    <DataTable columns={columns} data={notes} />
  );
}
```

## Conventions

- **Components**: shadcn/ui (all registry components preinstalled) + Tailwind,
  unless there's a very good reason not to. Mobile responsive.
- **Tables**: TanStack Table (`DataTable` in `@/components/ui/data-table`).
- **Forms**: TanStack Form. **Complex state**: zustand.
- **Avoid `useEffect`** — prefer loaders, TanStack Query, and event handlers.
- **Navigation**: a button that only navigates should be a link
  (`<Button asChild><Link …/></Button>`).
- **Entrance motion**: wrap a section in `<Reveal>`
  (`@/components/ui/motion`) — pure CSS fade + rise, auto-disabled under
  reduced-motion. `asChild` animates the element directly; `delay` (ms)
  staggers siblings.
- **Loading/error states**: with a single consumer, write the
  pending → error → data ladder inline in the page. Extract a shared
  `<QueryState>`-style component only when a second query-backed route exists.

## Live wiring

`src/routes/index.tsx` is the minimal live page: a TanStack Query `queryFn`
calling `apiClient.health.$get()` directly, an inline status ladder rendered as
a badge, `<Reveal>` + shadcn `Card` for layout.
