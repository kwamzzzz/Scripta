/**
 * The "…" menu.
 *
 * Every library row has had one since the tables were built — open, archive,
 * delete — but it lived inside Library, so a panel that wanted the same menu
 * had no way to ask for one. Tasks put Delete at the foot of its detail panel
 * as a red button instead, which is how a destructive action ended up with the
 * same weight as completing the work.
 *
 * Lifted out whole rather than rewritten: same trigger, same popover, same
 * danger treatment, so a row menu and a panel menu are the same object.
 */
import { useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { scriptaTheme } from "@/lib/tokens";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import "./library.css";

export type MenuAction = { label: string; onClick: () => void; danger?: boolean | undefined };

export default function ActionMenu({
  label,
  actions,
  trigger,
  align = "end",
}: {
  /** What the menu acts on, for the screen reader: "Actions for {label}". */
  label: string;
  actions: MenuAction[];
  /** Replaces the "…" button where a panel wants its own affordance. */
  trigger?: ReactNode;
  /** Which edge of the trigger the menu lines up with. */
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  if (!actions.length) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            className="scripta-library-icon-button"
            aria-label={`Actions for ${label}`}
            // A row is clickable underneath this button; opening its menu is
            // not also selecting it.
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            <MoreHorizontal size={18} aria-hidden="true" />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent
        className="scripta-library-popover scripta-library-actions"
        style={scriptaTheme}
        align={align}
        aria-label={`Actions for ${label}`}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            className={action.danger ? "is-danger" : undefined}
            onClick={() => {
              setOpen(false);
              action.onClick();
            }}
          >
            {action.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
