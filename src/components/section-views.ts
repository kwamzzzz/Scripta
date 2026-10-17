import type { PanelGroup, PanelItem } from "./SectionPanel";
/**
 * A library's views as panel groups, keeping the distinction the toolbar made:
 * filters are what you are looking at, Archived and Deleted are where a row
 * goes when it leaves the collection. Counts come off the rows, so the panel
 * says how much is behind each one before you click it.
 */
export function viewGroups<T>(
  views: { key: string; label: string; filter: (row: T) => boolean }[],
  rows: T[],
  heading = "Views",
): PanelGroup[] {
  const isPlace = (key: string) => key === "Archived" || key === "Deleted";
  const toItem = (v: { key: string; label: string; filter: (row: T) => boolean }): PanelItem => ({
    id: v.key,
    label: v.label,
    count: rows.filter(v.filter).length,
  });
  return [
    { heading, items: views.filter((v) => !isPlace(v.key)).map(toItem) },
    { aside: true, items: views.filter((v) => isPlace(v.key)).map(toItem) },
  ];
}
