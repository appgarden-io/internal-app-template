import { createFileRoute, useRouter } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Loader2, NotebookPen, Plus, Sparkles, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Reveal } from "@/components/ui/motion";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { createNote, deleteNote, fetchNotes, type Note } from "@/lib/api";

export const Route = createFileRoute("/")({
  loader: () => fetchNotes(),
  component: HomePage,
});

function HomePage() {
  const notes = Route.useLoaderData();
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);

  const handleAdd = async () => {
    const value = text.trim();
    if (!value || pending) {
      return;
    }
    setPending(true);
    try {
      await createNote(value);
      setText("");
      await router.invalidate();
    } finally {
      setPending(false);
    }
  };

  const handleDelete = useCallback(
    async (id: number) => {
      await deleteNote(id);
      await router.invalidate();
    },
    [router],
  );

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
      {
        accessorKey: "createdAt",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Created" />
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {new Date(row.original.createdAt).toLocaleString()}
          </span>
        ),
      },
      {
        id: "actions",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Delete note"
              onClick={() => void handleDelete(row.original.id)}
            >
              <Trash2 />
            </Button>
          </div>
        ),
      },
    ],
    [handleDelete],
  );

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-14 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <span className="text-sm font-medium">Notes</span>
        </header>

        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-10">
          <Reveal asChild>
            <div className="flex flex-col gap-2">
              <h1 className="text-3xl font-semibold tracking-tight">Notes</h1>
              <p className="text-muted-foreground">
                Jot down anything you want to remember — it's saved the moment
                you add it.
              </p>
            </div>
          </Reveal>

          <Reveal asChild delay={80}>
            <Card>
              <CardContent className="flex flex-col gap-4">
                <form
                  className="flex gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleAdd();
                  }}
                >
                  <Input
                    placeholder="Write a note…"
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    aria-label="Note text"
                  />
                  <Button
                    type="submit"
                    disabled={pending || text.trim() === ""}
                  >
                    {pending ? <Loader2 className="animate-spin" /> : <Plus />}
                    Add
                  </Button>
                </form>

                {notes.length === 0 ? (
                  <div className="rounded-xl border border-dashed px-6 py-10 text-center">
                    <p className="text-sm text-muted-foreground">
                      No notes yet. Add your first one above.
                    </p>
                  </div>
                ) : (
                  <DataTable columns={columns} data={notes} />
                )}
              </CardContent>
            </Card>
          </Reveal>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Sparkles className="size-4" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">Starter</span>
            <span className="text-xs text-muted-foreground">Workspace</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton isActive>
                  <NotebookPen />
                  <span>Notes</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
