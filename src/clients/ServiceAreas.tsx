/**
 * How much of a client's file to keep: the essentials, or full corporate
 * services. One switch sets all four optional areas; on an existing client each
 * can also be turned on or off alone ("Licences, but no marketing").
 */
import { isFullService, optionalAreasFor, type ClientKind, type OptionalArea } from "@/lib/clients";
import "@/screens/settings-screen.css";

const ESSENTIALS =
  "Organogram, group structure, people & responsibilities, authority & approvals, entities, key documents and Ask about the organisation.";

export default function ServiceAreas({
  kind,
  value,
  onChange,
  separately = false,
}: {
  kind: ClientKind;
  value: OptionalArea[];
  onChange: (next: OptionalArea[]) => void;
  /** Offer each optional area on its own, not only the switch. */
  separately?: boolean;
}) {
  const areas = optionalAreasFor(kind);
  const full = isFullService(kind, value);
  const organisation = kind === "organisation";

  return (
    <div className="cl-areas">
      {organisation && (
        <div className="cl-areas-switch">
          <div>
            <span className="cl-areas-title" id="cl-full-service">
              Full corporate services
            </span>
            <p className="org-hint">
              {full
                ? "For a client whose company the firm helps run. Everything below is on."
                : "Off: essentials only, for advisory work. Turn it on for a client whose company the firm helps run."}
            </p>
          </div>
          <button
            type="button"
            className={`settings-switch${full ? " is-on" : ""}`}
            role="switch"
            aria-checked={full}
            aria-labelledby="cl-full-service"
            onClick={() => onChange(full ? [] : areas.map((a) => a.id))}
          >
            <span />
          </button>
        </div>
      )}
      {organisation && (
        <p className="org-hint">
          <strong>Always included:</strong> {ESSENTIALS}
        </p>
      )}
      <div className="cl-areas-list">
        <span className="org-label">
          {organisation
            ? separately
              ? "Corporate-services areas"
              : "Full corporate services adds"
            : "Optional"}
        </span>
        <ul>
          {areas.map((a) => {
            const on = value.includes(a.id);
            return (
              <li key={a.id} className={!separately && !full ? "is-off" : undefined}>
                {separately ? (
                  <label>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() =>
                        onChange(on ? value.filter((x) => x !== a.id) : [...value, a.id])
                      }
                    />
                    <span>
                      <strong>{a.label}</strong> {a.body}
                    </span>
                  </label>
                ) : (
                  <span>
                    <strong>{a.label}</strong> {a.body}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      <p className="org-hint">
        You can change this later. Turning an area off hides it; nothing recorded in it is deleted.
      </p>
    </div>
  );
}
