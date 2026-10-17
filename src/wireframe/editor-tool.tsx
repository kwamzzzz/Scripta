/**
 * The toolbar controls a document editor is driven by.
 *
 * The contract editor and the memo composer are different documents with
 * different tools, but they are the same product and a lawyer moves between
 * them all day. So they share these controls rather than each drawing its own:
 * the same button, the same icon size, the same pressed and disabled states.
 */
import type { ReactNode } from "react";
import "./editor-toolbar.css";

/** One icon button on a toolbar. */
export function EditorTool({
  title,
  children,
  onClick,
  disabled,
  active,
}: {
  title: string;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      className={`ce-tool${active ? " is-active" : ""}`}
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active ?? false}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

/** The hairline between two groups of tools. */
export function ToolDivider() {
  return <i />;
}

/**
 * A toolbar dropdown, for a choice too wide for a button — a paragraph style, a
 * typeface. Styled as the toolbar's other compound controls are, so a ribbon
 * with dropdowns still reads as the same toolbar.
 */
export function EditorSelect({
  value,
  options,
  onPick,
  title,
  disabled,
}: {
  value: string;
  options: { label: string; value: string }[];
  onPick: (value: string) => void;
  title: string;
  disabled?: boolean;
}) {
  return (
    <select
      className="ce-toolbar-select"
      value={value}
      title={title}
      aria-label={title}
      disabled={disabled}
      onChange={(event) => onPick(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
