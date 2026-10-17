import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

/**
 * Data every screen reads, and how long a copy of it stays good enough to show
 * without asking again. Moving between screens re-mounts their queries; with
 * no allowance each move re-read the workspaces, the board and the open
 * matter even when they were fetched a moment before.
 *
 * The windows are short on purpose. Everything else keeps the default: fetched
 * on every visit, with any cached copy shown while it loads. Writes that change
 * these lists already invalidate them, so the window only matters for a change
 * made somewhere that does not.
 */
const REFERENCE_DATA: [key: string, staleTime: number][] = [
  // Which workspaces you belong to; renaming one invalidates it.
  ["workspaces", 5 * 60_000],
  // Whether you are a platform admin.
  ["platform-admin", 10 * 60_000],
  // The open matter's clauses, documents and review state (widely invalidated).
  ["matter-data", 30_000],
  // Workspace-wide lists most screens read.
  ["board", 15_000],
  ["matters", 15_000],
];

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      // Keep what was loaded for ten minutes, so returning to a screen shows
      // it at once while any refresh happens behind it.
      queries: { gcTime: 10 * 60_000 },
    },
  });
  for (const [key, staleTime] of REFERENCE_DATA)
    queryClient.setQueryDefaults([key], { staleTime });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Pointing at a link starts loading its screen's code before the click.
    defaultPreload: "intent",
    defaultPreloadStaleTime: 30_000,
    /*
     * Navigation goes through a view transition, which is what lets the
     * two-level navigation move rather than jump: the icon rail morphs between
     * its widths and a section's panel slides in and out, including on the way
     * out, where the element itself no longer exists to animate. Only the
     * chrome is named in CSS, so the page beneath swaps as it always did.
     * Browsers without the API navigate exactly as before.
     */
    defaultViewTransition: true,
  });

  return router;
};
