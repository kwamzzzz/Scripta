import { ArrowRight, Plus } from "lucide-react";
import GeminiUsage from "@/components/GeminiUsage";
import FeedbackChip from "@/components/FeedbackChip";
import DailyBriefing from "@/components/DailyBriefing";
import WorkReportCard from "@/components/WorkReportCard";
import TaskSummary from "@/components/TaskSummary";
import type { WF } from "../data";
import "./dashboard.css";

type D = typeof WF;

export function Topbar() {
  return (
    <>
      <span className="scripta-page-label">Dashboard</span>
      <div style={{ flex: 1 }} />
      <FeedbackChip screen="Dashboard" />
      <GeminiUsage />
    </>
  );
}

export default function Content({ d }: { d: D }) {
  return (
    <div data-frame="1a" className="dashboard-page">
      <div className="dashboard-inner">
        <header className="dashboard-heading">
          <div>
            <p className="dashboard-date">{d.dateLabel}</p>
            <h1>{d.greeting}</h1>
          </div>
          <button
            type="button"
            className="scripta-button dashboard-new"
            onClick={() => d.on.startNew?.()}
          >
            <Plus size={16} aria-hidden="true" /> New matter
          </button>
        </header>
        <div className="dashboard-columns">
          <div className="dashboard-work">
            <TaskSummary />
            {/* What needs doing, then what got done. In the main column rather
                than the aside, which stacks below a very long page on most
                screens — a report nobody scrolls to is a report nobody reads. */}
            <WorkReportCard />
            <section className="dashboard-recent" aria-labelledby="dashboard-recent-heading">
              <h2 id="dashboard-recent-heading">
                {d.resume.id ? "Continue working" : "Get started"}
              </h2>
              <button type="button" className="dashboard-resume" onClick={() => d.on.resume?.()}>
                <span className="dashboard-resume-copy">
                  <strong>{d.resume.name}</strong>
                  <span>{d.resume.line}</span>
                </span>
                <span className="dashboard-open-label">
                  {d.resume.id ? "Open matter" : "Create matter"}
                </span>
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            </section>
            <section className="dashboard-matters" aria-labelledby="dashboard-matters-heading">
              <div className="dashboard-section-heading">
                <h2 id="dashboard-matters-heading">Your matters</h2>
                <button
                  type="button"
                  className="scripta-text-button"
                  onClick={() => d.on.viewAll?.()}
                >
                  View all <ArrowRight size={14} aria-hidden="true" />
                </button>
              </div>
              {[
                { title: "In review", rows: d.review, empty: "No matters in review." },
                { title: "Drafting", rows: d.drafts, empty: "No open drafting points." },
              ].map(({ title, rows, empty }) => (
                <div className="dashboard-matter-group" key={title}>
                  <h3>
                    {title} <span>{rows.length}</span>
                  </h3>
                  {rows.length ? (
                    <ul className="dashboard-matter-list">
                      {rows.map((row) => (
                        <li key={row.id}>
                          <button
                            type="button"
                            className="dashboard-matter-row"
                            onClick={() => d.on.openMatter?.(row)}
                          >
                            <span className="dashboard-matter-copy">
                              <strong>{row.name}</strong>
                              <span>{row.party}</span>
                            </span>
                            <span className="dashboard-matter-status">{row.when}</span>
                            <ArrowRight size={16} aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="dashboard-empty">{empty}</p>
                  )}
                </div>
              ))}
            </section>
          </div>
          <aside className="dashboard-briefing" aria-label="News briefing">
            <DailyBriefing />
          </aside>
        </div>
      </div>
    </div>
  );
}
