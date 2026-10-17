/**
 * The page a matter you cannot open gives you.
 *
 * It is deliberately the same page whether the matter was binned, the id was
 * mistyped, or it belongs to colleagues whose file you are not on. A matter you
 * cannot open must be indistinguishable from one that never existed — so there
 * is no name, no reference, no client, no "ask the Lead for access" and no
 * "request access" button. Each of those would confirm that the file exists,
 * and the last two would name somebody who works on it.
 *
 * What it does give is the way out, which is the only thing that is actually
 * useful to whoever is standing here.
 */
import { Link } from "@tanstack/react-router";

import "./matter-unavailable.css";

const BACK = {
  matter: { to: "/matters", label: "Matters" },
  flow: { to: "/matters/flow", label: "Flow" },
  client: { to: "/clients", label: "Clients" },
} as const;

export default function MatterUnavailable({
  what = "matter",
}: {
  /** The same page for a flow or a client that cannot be opened, for the same reason. */
  what?: keyof typeof BACK;
} = {}) {
  return (
    <main className="matter-unavailable">
      <div className="matter-unavailable-card">
        <p className="matter-unavailable-mark">Scripta</p>
        <h1>This {what} isn’t available</h1>
        <p>
          It may have been deleted, or the link may be wrong. If a colleague sent it to you, ask
          them to check it.
        </p>
        <Link to={BACK[what].to} className="matter-unavailable-back">
          Back to {BACK[what].label} →
        </Link>
      </div>
    </main>
  );
}
