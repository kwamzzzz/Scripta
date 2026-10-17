import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bookmark, BookmarkCheck, Clock3, ExternalLink, RotateCcw } from "lucide-react";
import { useApp } from "@/store/app";
import { usePersisted } from "@/lib/use-board";
import {
  isSaved,
  readSaved,
  RETENTION_DAYS,
  retentionLabel,
  toggleSaved,
  type SavedArticle,
} from "@/lib/saved-briefing";
import { NEWS_VISUALS_PREFERENCE_KEY } from "@/lib/news-visuals";
import NewsVisualStrip from "@/components/NewsVisualStrip";
import {
  BRIEFING_CATEGORIES,
  fetchDailyBriefing,
  type BriefingArticle,
  type BriefingCategory,
} from "@/lib/daily-briefing";

import "./daily-briefing.css";

const EMPTY_SAVED: SavedArticle[] = [];

/** "Saved" is a state, not a subject, so it sits beside the categories
 *  rather than inside them. */
const SAVED_VIEW = "Saved";
type BriefingView = BriefingCategory | typeof SAVED_VIEW;

function StoryMeta({ article }: { article: BriefingArticle | SavedArticle }) {
  // A publisher who gives a date gets it shown; one who does not is not given
  // an invented one, because a wrong date on a legal development is worse
  // than no date.
  const published = article.published ? new Date(article.published) : null;
  const dated = published && !Number.isNaN(published.getTime()) ? published : null;
  const savedAt = "savedAt" in article ? (article as SavedArticle) : null;

  return (
    <div className="daily-briefing-meta">
      <span>{article.source}</span>
      {dated && (
        <>
          <span aria-hidden="true">•</span>
          <span>
            {dated.toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
        </>
      )}
      <span aria-hidden="true">•</span>
      <span>
        <Clock3 size={11} aria-hidden="true" />
        {article.readingMinutes} min read
      </span>
      {savedAt && (
        <>
          <span aria-hidden="true">•</span>
          <span title={`Saved items are dropped ${RETENTION_DAYS} days after saving`}>
            {retentionLabel(savedAt)}
          </span>
        </>
      )}
    </div>
  );
}

function SaveButton({
  article,
  saved,
  onToggle,
}: {
  article: BriefingArticle;
  saved: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`daily-briefing-save${saved ? " is-saved" : ""}`}
      aria-label={`${saved ? "Remove" : "Save"} ${article.title}`}
      aria-pressed={saved}
      title={saved ? "Remove saved article" : "Save article"}
      onClick={onToggle}
    >
      {saved ? (
        <BookmarkCheck size={15} aria-hidden="true" />
      ) : (
        <Bookmark size={15} aria-hidden="true" />
      )}
    </button>
  );
}

export default function DailyBriefing() {
  const { workspaceId } = useApp();
  const [category, setCategory] = useState<BriefingView>("All");
  // Kept under a new key: the old one held bare ids, which point at articles
  // the publishers have long since rotated away.
  const [savedRaw, setSavedRaw] = usePersisted<SavedArticle[]>(
    `px.daily-briefing.saved.v2.${workspaceId ?? "local"}`,
    EMPTY_SAVED,
  );
  const [visualsEnabled] = usePersisted(NEWS_VISUALS_PREFERENCE_KEY, true);
  const briefing = useQuery({
    queryKey: ["daily-briefing"],
    queryFn: ({ signal }) => fetchDailyBriefing({ signal }),
    staleTime: 15 * 60 * 1000,
    retry: 1,
  });

  // Expired items are dropped on read, so nothing past its fifteen days is
  // ever shown even if the list has not been written since.
  const saved = useMemo(() => readSaved(savedRaw), [savedRaw]);

  const articles = useMemo(() => {
    if (category === SAVED_VIEW) return saved;
    return (briefing.data?.articles ?? []).filter(
      (article) => category === "All" || article.category === category,
    );
  }, [briefing.data?.articles, category, saved]);

  const lead = articles.find((article) => article.lead) ?? articles[0];
  const supporting = articles.filter((article) => article.id !== lead?.id).slice(0, 3);
  const toggle = (article: BriefingArticle) =>
    setSavedRaw((current) => toggleSaved(readSaved(current), article));

  return (
    <section className="daily-briefing" aria-labelledby="daily-briefing-title">
      <header className="daily-briefing-header">
        <h2 id="daily-briefing-title">Daily briefing</h2>
        {briefing.data?.isDemo && <span className="daily-briefing-demo">Demo edition</span>}
        {briefing.data && (
          <a
            className="daily-briefing-view-all"
            href={briefing.data.viewAllUrl}
            target="_blank"
            rel="noreferrer"
          >
            All news <ExternalLink size={12} aria-hidden="true" />
          </a>
        )}
      </header>

      <div className="daily-briefing-filters" aria-label="Briefing categories">
        {BRIEFING_CATEGORIES.map((item) => (
          <button
            type="button"
            key={item}
            className={category === item ? "is-active" : ""}
            aria-pressed={category === item}
            onClick={() => setCategory(item)}
          >
            {item}
          </button>
        ))}
        <button
          type="button"
          className={category === SAVED_VIEW ? "is-active" : ""}
          aria-pressed={category === SAVED_VIEW}
          onClick={() => setCategory(SAVED_VIEW)}
          title={`Saved items are kept for ${RETENTION_DAYS} days`}
        >
          {SAVED_VIEW}
          {saved.length > 0 ? ` (${saved.length})` : ""}
        </button>
      </div>

      <NewsVisualStrip enabled={visualsEnabled} />

      {briefing.isPending && (
        <div className="daily-briefing-loading" aria-live="polite" aria-label="Loading briefing">
          <div className="daily-briefing-skeleton is-lead" />
          <div className="daily-briefing-skeleton" />
          <span className="sr-only">Loading the Daily Briefing…</span>
        </div>
      )}

      {briefing.isError && (
        <div className="daily-briefing-state is-error" role="alert">
          <div>
            <strong>The Daily Briefing could not be loaded.</strong>
            <span>Check the provider connection, then try again.</span>
          </div>
          <button type="button" onClick={() => void briefing.refetch()}>
            <RotateCcw size={13} aria-hidden="true" /> Retry
          </button>
        </div>
      )}

      {briefing.isSuccess && !lead && (
        <div className="daily-briefing-state">
          <div>
            <strong>
              {category === SAVED_VIEW
                ? "Nothing saved."
                : `No ${category === "All" ? "briefing stories" : `${category.toLowerCase()} stories`} yet.`}
            </strong>
            <span>
              {category === SAVED_VIEW
                ? `Use the bookmark on a story to keep it here. Saved items are kept for ${RETENTION_DAYS} days, then dropped — attach anything that matters to a matter.`
                : "Try another category or check back after the next update."}
            </span>
          </div>
          {category !== "All" && (
            <button type="button" onClick={() => setCategory("All")}>
              Clear filter
            </button>
          )}
        </div>
      )}

      {briefing.isSuccess && lead && (
        <div className="daily-briefing-stories">
          <article className="daily-briefing-lead">
            <div className="daily-briefing-story-topline">
              <span className="daily-briefing-category">{lead.category}</span>
              <SaveButton
                article={lead}
                saved={isSaved(saved, lead.id)}
                onToggle={() => toggle(lead)}
              />
            </div>
            <a href={lead.url} target="_blank" rel="noreferrer">
              <h3>{lead.title}</h3>
            </a>
            <p>{lead.summary}</p>
            <StoryMeta article={lead} />
          </article>

          <div className="daily-briefing-supporting">
            {supporting.map((article) => (
              <article key={article.id}>
                <div>
                  <span className="daily-briefing-category">{article.category}</span>
                  <a href={article.url} target="_blank" rel="noreferrer">
                    <h3>{article.title}</h3>
                  </a>
                  <StoryMeta article={article} />
                </div>
                <SaveButton
                  article={article}
                  saved={isSaved(saved, article.id)}
                  onToggle={() => toggle(article)}
                />
              </article>
            ))}
          </div>
        </div>
      )}

      {briefing.data?.isDemo ? (
        <footer className="daily-briefing-disclosure">
          Temporary focused edition · Dubai/UAE, UK and Ghana law, with priority coverage of GoldBod
          and Ghana's mining sector.
        </footer>
      ) : (
        briefing.data?.sources && (
          /* Who was read, and who could not be. A briefing that quietly drops
             a regulator leaves the reader unable to tell "nothing happened"
             from "we did not look". */
          <footer className="daily-briefing-disclosure">
            {briefing.data.sources.map((source) => (
              <span key={source.id} title={source.note ?? `${source.count} items`}>
                {source.ok ? "" : "⚠ "}
                {source.name}
                {source.ok ? ` (${source.count})` : ` — ${source.note ?? "unreachable"}`}
                {" · "}
              </span>
            ))}
            <span>
              Dubai/UAE law and GhaLII are not connected yet — those filters will stay empty.
            </span>
          </footer>
        )
      )}
    </section>
  );
}
