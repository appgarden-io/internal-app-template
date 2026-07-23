import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { createNote } from "@/lib/api";
import { notesQueryOptions } from "./queries";

/**
 * The mandated form pattern: `@tanstack/react-form` for state + validation,
 * `@tanstack/react-query` for the write. The field's `onChange` validator
 * rejects empty text, `form.Subscribe` gates the button on `canSubmit`, and the
 * mutation invalidates the shared notes key so the list refetches on success.
 */
export function NoteForm() {
  const queryClient = useQueryClient();

  const createNoteMutation = useMutation({
    mutationFn: createNote,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: notesQueryOptions.queryKey }),
  });

  const form = useForm({
    defaultValues: { text: "" },
    // Fire-and-forget `.mutate()` (not `mutateAsync`): a failed create must not
    // reject out of `handleSubmit` as an unhandled rejection. The error is shown
    // from `createNoteMutation.isError` below; the form resets only on success.
    onSubmit: ({ value, formApi }) => {
      createNoteMutation.mutate(value.text.trim(), {
        onSuccess: () => formApi.reset(),
      });
    },
  });

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <div className="flex items-start gap-2">
        <form.Field
          name="text"
          validators={{
            onChange: ({ value }) =>
              value.trim() === "" ? "Write something first." : undefined,
          }}
        >
          {(field) => (
            <div className="flex flex-1 flex-col gap-1">
              <Input
                placeholder="Write a note…"
                aria-label="Note text"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
              />
              {field.state.meta.isTouched &&
                field.state.meta.errors.length > 0 && (
                  <p className="px-1 text-sm text-destructive">
                    {field.state.meta.errors[0]}
                  </p>
                )}
            </div>
          )}
        </form.Field>

        <form.Subscribe selector={(state) => state.canSubmit}>
          {(canSubmit) => (
            <Button
              type="submit"
              disabled={!canSubmit || createNoteMutation.isPending}
            >
              {createNoteMutation.isPending ? <Spinner /> : <Plus />}
              Add
            </Button>
          )}
        </form.Subscribe>
      </div>

      {createNoteMutation.isError && (
        <p className="px-1 text-sm text-destructive">
          {createNoteMutation.error.message}
        </p>
      )}
    </form>
  );
}
