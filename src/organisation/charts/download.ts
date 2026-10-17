/** Building and handing over chart files; shared by the export menu and the studio. */
import { downloadBytes, PDF_MIME } from "@/lib/export/download";
import { utf8 } from "@/lib/export/zip";
import { formatDay, type Day } from "../model";
import {
  chartCsv,
  chartPdf,
  chartPptx,
  chartSvg,
  CSV_MIME,
  PPTX_MIME,
  SVG_MIME,
  type ChartMeta,
  type Paper,
} from "./export";
import type { Composition } from "./compose";

export type ExportFormat = "pdf" | "pptx" | "svg" | "csv";

export const chartMeta = (title: string, asAt: Day): ChartMeta => ({
  title,
  footer: `As at ${formatDay(asAt, "long")} · Scripta`,
});

const slug = (s: string) =>
  s
    .replace(/[—–]/g, "-")
    .replace(/[^A-Za-z0-9 -]+/g, "")
    .trim()
    .replace(/\s+/g, " ");

/** Build and hand over one chart file. */
export function downloadChart(
  chart: Composition,
  meta: ChartMeta,
  asAt: Day,
  format: ExportFormat,
  paper: Paper = "A3",
) {
  const base = `${slug(meta.title)} ${asAt}`;
  if (format === "pdf") downloadBytes(chartPdf(chart, meta, paper), `${base}.pdf`, PDF_MIME);
  else if (format === "pptx")
    downloadBytes(chartPptx(chart, meta, paper), `${base}.pptx`, PPTX_MIME);
  else if (format === "svg") downloadBytes(utf8(chartSvg(chart, meta)), `${base}.svg`, SVG_MIME);
  else
    downloadBytes(
      utf8(`${String.fromCharCode(0xfeff)}${chartCsv(chart, meta)}`),
      `${base}.csv`,
      CSV_MIME,
    );
}
