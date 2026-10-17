/**
 * A section's own navigation, in the shell's panel column.
 *
 * The two-level pattern Learning introduced, made reusable: the icon rail says
 * which section you are in, and this says where you are inside it. It exists
 * because a portal's own choices — ten career views, seven admin tabs, a
 * library's filters — were being squeezed into a horizontal row of tabs that
 * could not show how they group, or into the main rail, which is not theirs.
 *
 * The component is deliberately dumb: it takes groups of items and an active
 * id, and reports clicks. What the items mean, and what selecting one does, is
 * the section's business.
 */
import { type ReactNode } from "react";
import "./section-panel.css";

export type PanelItem = {
  id: string;
  label: string;
  /** How many rows are behind it. Omitted where a count would be noise. */
  count?: number | undefined;
  /** Renders a tick: the thing is finished rather than merely selectable. */
  done?: boolean | undefined;
  /** Shown, because hiding it would be a lie, but not selectable yet. */
  disabled?: boolean | undefined;
  icon?: ReactNode | undefined;
};

export type PanelGroup = {
  heading?: string | undefined;
  /**
   * Set apart at the foot of the list. Archived and Deleted are not filters —
   * they are where a row goes when it leaves the collection — and dressing
   * them like filters is how they became invisible.
   */
  aside?: boolean | undefined;
  items: PanelItem[];
};

export function SectionPanel({
  title,
  meta,
  groups,
  activeId,
  onSelect,
  foot,
  tone = "light",
}: {
  title: string;
  meta?: ReactNode | undefined;
  groups: PanelGroup[];
  activeId: string | null;
  onSelect: (id: string) => void;
  /** Pinned at the bottom, so a standing figure survives a long list. */
  foot?: ReactNode | undefined;
  /** Learning is the one dark area of the app; everywhere else is light. */
  tone?: "light" | "dark";
}) {
  return (
    <nav className="sp" data-tone={tone} aria-label={`${title} navigation`}>
      <div className="sp-head">
        <div className="sp-title">{title}</div>
        {meta ? <div className="sp-meta">{meta}</div> : null}
      </div>

      <div className="sp-list">
        {groups.map((group, index) => {
          if (group.items.length === 0) return null;
          return (
            <div key={group.heading ?? index} className="sp-group" data-aside={group.aside || undefined}>
              {group.heading ? <div className="sp-heading">{group.heading}</div> : null}
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="sp-link"
                  aria-current={activeId === item.id ? "true" : undefined}
                  disabled={item.disabled}
                  onClick={() => onSelect(item.id)}
                >
                  {item.icon ? <span className="sp-icon">{item.icon}</span> : null}
                  {item.done !== undefined ? (
                    <span className="sp-tick" data-on={item.done || undefined}>
                      {item.done ? "✓" : ""}
                    </span>
                  ) : null}
                  <span className="sp-label">{item.label}</span>
                  {item.count !== undefined ? <span className="sp-count">{item.count}</span> : null}
                </button>
              ))}
            </div>
          );
        })}
      </div>

      {foot ? <div className="sp-foot">{foot}</div> : null}
    </nav>
  );
}
