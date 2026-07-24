import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * A single-date picker: a button that opens a calendar in a popover.
 *
 * It is **controlled** — you hold the selected `Date` in your own state (or a
 * form field) and pass it back in through `value`, reacting to `onChange`:
 *
 * ```tsx
 * const [date, setDate] = useState<Date>();
 * <DatePicker value={date} onChange={setDate} />
 * ```
 *
 * Built by composing `Popover` + `Calendar` + `Button` — there is no separate
 * calendar library to learn; edit the `<Calendar>` below to add constraints
 * (e.g. `disabled`, `startMonth`, `captionLayout="dropdown"`).
 */
interface DatePickerProps {
  /** The currently selected date, or `undefined` when nothing is chosen. */
  value?: Date;
  /**
   * Called with the new date, or `undefined` when the selection is cleared.
   * Required: this is a controlled component, so a picker without a handler
   * would silently drop every selection.
   */
  onChange: (date: Date | undefined) => void;
  /** Label shown on the trigger while no date is selected. */
  placeholder?: string;
  /** `date-fns` format string for the selected date. Defaults to `"PPP"`. */
  formatStr?: string;
  /** Disable the trigger so no date can be picked. */
  disabled?: boolean;
  /** Forwarded to the trigger's `id` so a `<label htmlFor>` can target it. */
  id?: string;
  /** Extra classes for the trigger button (e.g. `"w-full"`). */
  className?: string;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  formatStr = "PPP",
  disabled,
  id,
  className,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            variant="outline"
            disabled={disabled}
            data-empty={!value}
            className={cn(
              "w-[240px] justify-start text-left font-normal data-[empty=true]:text-muted-foreground",
              className,
            )}
          />
        }
      >
        <CalendarIcon />
        {value ? format(value, formatStr) : <span>{placeholder}</span>}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={(date) => {
            onChange(date);
            setOpen(false);
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
