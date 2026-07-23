import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Trash2 } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table";
import { deleteNote, type Note } from "@/lib/api";
import { notesQueryOptions } from "./queries";

/** Renders the saved notes. Delete is a react-query mutation that invalidates
 * the shared notes key, so the list refetches without any manual refresh. */
export function NotesTable({ notes }: { notes: Note[] }) {
  const queryClient = useQueryClient();

  const deleteNoteMutation = useMutation({
    mutationFn: deleteNote,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: notesQueryOptions.queryKey }),
  });

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
              disabled={deleteNoteMutation.isPending}
              onClick={() => deleteNoteMutation.mutate(row.original.id)}
            >
              <Trash2 />
            </Button>
          </div>
        ),
      },
    ],
    [deleteNoteMutation],
  );

  return (
    <div className="flex flex-col gap-2">
      {deleteNoteMutation.isError && (
        <p className="px-1 text-sm text-destructive">
          {deleteNoteMutation.error.message}
        </p>
      )}
      <DataTable columns={columns} data={notes} />
    </div>
  );
}
