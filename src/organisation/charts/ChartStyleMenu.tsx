/**
 * Chart style ▾ — how the arms, connectors and cards are drawn.
 *
 * The options are the choices the firm's own structure decks make, so a chart
 * can be matched to a deck it will sit in. Every line still meets a card at the
 * middle of an edge; that is not offered as a choice.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/primitives";
import { Segmented } from "../ui";
import type { ChartStyle } from "./style";

export default function ChartStyleMenu({
  style,
  onChange,
  onReset,
  ownership,
}: {
  style: ChartStyle;
  onChange: (patch: Partial<ChartStyle>) => void;
  onReset: () => void;
  /** Ownership charts have second shareholders; reporting lines do not. */
  ownership: boolean;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (
        e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const row = (label: string, control: ReactNode, hint?: string) => (
    <div className="oc-style-row">
      <span className="oc-style-label">{label}</span>
      <div>
        {control}
        {hint && <p className="oc-style-hint">{hint}</p>}
      </div>
    </div>
  );

  return (
    <div className="oc-menu" ref={box}>
      <Button onClick={() => setOpen((v) => !v)}>Chart style ▾</Button>
      {open && (
        <div className="oc-menu-list oc-style" role="dialog" aria-label="Chart style">
          {row(
            "Connectors",
            <Segmented
              label="Connectors"
              value={style.connector}
              onChange={(connector) => onChange({ connector })}
              options={[
                { id: "squared", label: "Squared arms" },
                { id: "straight", label: "Straight" },
              ]}
            />,
            "Lines leave and enter each card at the middle of an edge.",
          )}
          {ownership &&
            row(
              "Second holder",
              <Segmented
                label="Second holder"
                value={style.secondHolder}
                onChange={(secondHolder) => onChange({ secondHolder })}
                options={[
                  { id: "side", label: "Into the side" },
                  { id: "joined", label: "Joins above" },
                ]}
              />,
              style.secondHolder === "side"
                ? "Another shareholder's line enters the side of the card, as the 51% line does."
                : "Shareholders' lines meet above the card, each share on its own arm.",
            )}
          {row(
            "Arrowheads",
            <Segmented
              label="Arrowheads"
              value={style.arrows ? "on" : "off"}
              onChange={(v) => onChange({ arrows: v === "on" })}
              options={[
                { id: "off", label: "None" },
                { id: "on", label: "At the card" },
              ]}
            />,
          )}
          {row(
            "Line",
            <div className="oc-style-pair">
              <Segmented
                label="Line weight"
                value={style.weight}
                onChange={(weight) => onChange({ weight })}
                options={[
                  { id: "fine", label: "Fine" },
                  { id: "regular", label: "Regular" },
                  { id: "bold", label: "Bold" },
                ]}
              />
              <Segmented
                label="Line colour"
                value={style.colour}
                onChange={(colour) => onChange({ colour })}
                options={[
                  { id: "navy", label: "Navy" },
                  { id: "grey", label: "Slate" },
                ]}
              />
            </div>,
          )}
          {row(
            "Cards",
            <div className="oc-style-pair">
              <Segmented
                label="Card fill"
                value={style.boxes}
                onChange={(boxes) => onChange({ boxes })}
                options={[
                  { id: "tinted", label: "Tinted" },
                  { id: "outlined", label: "White, navy edge" },
                ]}
              />
              <Segmented
                label="Corners"
                value={style.corners}
                onChange={(corners) => onChange({ corners })}
                options={[
                  { id: "square", label: "Square" },
                  { id: "rounded", label: "Rounded" },
                ]}
              />
            </div>,
          )}
          <div className="oc-style-foot">
            <span>Exports use the same style.</span>
            <button type="button" className="org-link" onClick={onReset}>
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
