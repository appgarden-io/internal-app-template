import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Reveal } from "@/components/ui/motion";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { AppSidebar } from "./-notes/app-sidebar";
import { NoteForm } from "./-notes/note-form";
import { NotesTable } from "./-notes/notes-table";
import { notesQueryOptions } from "./-notes/queries";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  // Data comes from react-query (not a route loader) so this page can render the
  // full loading → error → empty → data ladder below. This is the pattern to
  // copy for any data-backed screen.
  const notes = useQuery(notesQueryOptions);

  const renderNotesList = () => {
    if (notes.isPending) {
      return (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      );
    }

    if (notes.isError) {
      return (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyTitle>Couldn't load your notes</EmptyTitle>
            <EmptyDescription>{notes.error.message}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              type="button"
              variant="outline"
              onClick={() => void notes.refetch()}
            >
              Retry
            </Button>
          </EmptyContent>
        </Empty>
      );
    }

    if (notes.data.length === 0) {
      return (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <NotebookPen />
            </EmptyMedia>
            <EmptyTitle>No notes yet</EmptyTitle>
            <EmptyDescription>Add your first one above.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }

    return <NotesTable notes={notes.data} />;
  };

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
                <NoteForm />
                {renderNotesList()}
              </CardContent>
            </Card>
          </Reveal>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
