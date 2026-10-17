import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/primitives";
import type { Day } from "../model";
import type { Composition } from "./compose";
import { chartMeta, downloadChart, type ExportFormat } from "./download";

/** Export ▾ — the four files, drawn from what is on screen. */
export default function ExportMenu({
  chart,
  title,
  asAt,
}: {
  chart: Composition;
  title: string;
  asAt: Day;
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
  const run = (format: ExportFormat) => {
    setOpen(false);
    downloadChart(chart, chartMeta(title, asAt), asAt, format, "A3");
  };
  return (
    <div className="oc-menu" ref={box}>
      <Button onClick={() => setOpen((v) => !v)} disabled={!chart.nodes.length}>
        Export ▾
      </Button>
      {open && (
        <div className="oc-menu-list" role="menu">
          <button type="button" role="menuitem" onClick={() => run("pdf")}>
            PDF <small>A3 · vector</small>
          </button>
          <button type="button" role="menuitem" onClick={() => run("pptx")}>
            PowerPoint <small>shapes</small>
          </button>
          <button type="button" role="menuitem" onClick={() => run("svg")}>
            SVG <small>image</small>
          </button>
          <button type="button" role="menuitem" onClick={() => run("csv")}>
            CSV <small>nodes · lines</small>
          </button>
        </div>
      )}
    </div>
  );
}
