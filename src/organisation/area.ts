import type { Client } from "@/lib/clients";
import type { OrgArea, Organisation } from "./model";

/** Where to go inside a client's organisation. `null` clears a value. */
export type OrgGo = (to: { area?: OrgArea; item?: string | null; mode?: string | null }) => void;

/** What every organisation area is given. */
export type AreaProps = {
  org: Organisation;
  client: Client;
  /** The record selected in this area, from the address. */
  item: string | null;
  /** A working view of the area, from the address: "studio", "new". */
  mode: string | null;
  go: OrgGo;
  /** Leave the organisation for another client tab (matters, tasks). */
  openTab: (tab: "matters" | "flows" | "tasks" | "documents") => void;
  /** Whether this client's file carries an area; links into one it does not are not shown. */
  on: (area: OrgArea) => boolean;
};
