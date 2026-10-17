/**
 * Work shown inside the thing it belongs to.
 *
 * A client's flow opens inside the client and a matter's flow inside the
 * matter; a matter opened from its client opens inside the client too. The
 * screen that draws the work (the flow, the matter file) is the same one it is
 * on its own. The host only lends it a frame: which section the sidebar marks,
 * where Back goes, the start of the breadcrumb, and its own tab strip, drawn
 * above the work's.
 *
 * Standalone work keeps its own address. Every link to a flow still goes to
 * /flows/:id, which sends a filed flow on to its home, so nothing that links
 * to a flow has to know where it lives.
 */
import { createContext, useContext, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { CrumbItem } from "@/components/AppShell";
import type { SectionKey } from "@/lib/app-navigation";
import type { Trail } from "@/lib/nav";
import type { FlowSearch, FlowView } from "@/matter-flow/MatterFlowScreen";

export type HostFrame = {
  section: SectionKey;
  back: Trail;
  /** The breadcrumb up to, not including, the work's own name. */
  crumbs: CrumbItem[];
  /** The host's tab strip, drawn above the work's own tabs. */
  tabs?: ReactNode;
};

/* ---------------------------------------------------------- opening flows */

const FlowOpener = createContext<((flowId: string) => void) | null>(null);

/** Inside a host, flows open where the host says; elsewhere, at their own address. */
export const FlowOpenerProvider = FlowOpener.Provider;

export function useOpenFlow(): (flowId: string) => void {
  const host = useContext(FlowOpener);
  const navigate = useNavigate();
  return host ?? ((flowId) => void navigate({ to: "/flows/$flowId", params: { flowId } }));
}

/* ------------------------------------------------------ flows in a host */

/**
 * A flow's place in a host's address. `view` is spelt `fview` there because
 * the client page already has a `view` of its own (the marketing view).
 */
export type HostedFlowSearch = {
  flow?: string | undefined;
  fview?: FlowView | undefined;
  phase?: string | undefined;
  deliverable?: string | undefined;
  version?: string | undefined;
  email?: string | undefined;
  start?: "preset" | "ask" | undefined;
};

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
const FLOW_VIEW_IDS = ["checklist", "repository", "timeline"];

/** Read the hosted-flow part of a host route's search. */
export function readHostedFlow(search: Record<string, unknown>): HostedFlowSearch {
  return {
    flow: str(search["flow"]),
    fview: FLOW_VIEW_IDS.includes(search["fview"] as string)
      ? (search["fview"] as FlowView)
      : undefined,
    phase: str(search["phase"]),
    deliverable: str(search["deliverable"]),
    version: str(search["version"]),
    email: str(search["email"]),
    start: search["start"] === "preset" || search["start"] === "ask" ? search["start"] : undefined,
  };
}

/** The flow screen's own search, from a host's. */
export const flowSearchOf = (h: HostedFlowSearch): FlowSearch => ({
  view: h.fview,
  phase: h.phase,
  deliverable: h.deliverable,
  version: h.version,
  email: h.email,
  start: h.start,
});

/** A change to the flow screen's search, as a change to the host's. */
export function hostedPatch(patch: Partial<FlowSearch>): Partial<HostedFlowSearch> {
  const out: Partial<HostedFlowSearch> = {};
  if ("view" in patch) out.fview = patch.view;
  if ("phase" in patch) out.phase = patch.phase;
  if ("deliverable" in patch) out.deliverable = patch.deliverable;
  if ("version" in patch) out.version = patch.version;
  if ("email" in patch) out.email = patch.email;
  if ("start" in patch) out.start = patch.start;
  return out;
}

/** Everything a hosted flow put in the address, cleared, for leaving it. */
export const NO_HOSTED_FLOW: HostedFlowSearch = {
  flow: undefined,
  fview: undefined,
  phase: undefined,
  deliverable: undefined,
  version: undefined,
  email: undefined,
  start: undefined,
};
