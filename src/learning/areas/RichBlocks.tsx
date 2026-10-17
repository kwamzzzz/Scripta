/**
 * The blocks that are not reading: media, a practice question, a deck of
 * flashcards, a table.
 *
 * A practice question and a flashcard deck keep their state on screen only.
 * Nothing a learner picks is written anywhere: these are for finding out what
 * you know, and a record of it would make them a test.
 */
import { useMemo, useState } from "react";
import type { Block, Flashcard, Media } from "../blocks";
import { useMediaUrl } from "../media";
import { linkify } from "../linkify";

export function RichBlock({ block }: { block: Block }) {
  if (block.type === "media" && block.media)
    return <MediaView media={block.media} caption={block.text} />;
  if (block.type === "quiz") return <QuizView block={block} />;
  if (block.type === "flashcards")
    return <FlashcardDeck title={block.text} cards={block.cards ?? []} />;
  if (block.type === "table") return <TableView title={block.text} rows={block.rows ?? []} />;
  if (block.type === "caveat") return <CaveatView text={block.text} />;
  if (block.type === "credit") return <CreditCard block={block} />;
  return null;
}

/** Where the source is older than the law: what changed, and what to check. */
export function CaveatView({ text }: { text: string }) {
  return (
    <aside className="lr-caveat" role="note">
      <div className="lr-label">Check the current position</div>
      <p>{linkify(text)}</p>
    </aside>
  );
}

/**
 * Somebody who made the course, and where they come from. An empty name is a
 * place kept for them, shown as such rather than hidden, so the course says
 * who still has to be credited.
 */
export function CreditCard({ block, compact = false }: { block: Block; compact?: boolean }) {
  const name = block.text.trim();
  const org = block.org?.trim() ?? "";
  // A person gets a face: their photograph, or their initials. An institution
  // credited without a person gets its logo in the same place.
  const person = !!name;
  return (
    <div
      className="lr-credit"
      data-placeholder={!name && !org ? true : undefined}
      data-compact={compact || undefined}
    >
      {person ? (
        <CreditPhoto photo={block.photo} name={name} />
      ) : block.media ? (
        <CreditLogo media={block.media} alt={org} />
      ) : null}
      <div className="lr-credit-text">
        <b>{name || org || "Name to be added"}</b>
        {block.cite ? <span>{block.cite}</span> : null}
        {person && org ? <span className="lr-credit-org">{org}</span> : null}
        {person && block.media ? <CreditLogo media={block.media} alt={org} /> : null}
      </div>
    </div>
  );
}

function CreditPhoto({ photo, name }: { photo: Media | undefined; name: string }) {
  const url = useMediaUrl(photo?.path ?? null);
  if (photo && url.data) {
    return (
      <span className="lr-credit-photo">
        <img src={url.data} alt={name} />
      </span>
    );
  }
  const initials = name
    .replace(/^(dr|mr|mrs|ms|prof)\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <span className="lr-credit-photo" data-empty="true" title="Photo to be added">
      {initials || (
        <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
          <circle cx="12" cy="8.5" r="4" fill="currentColor" />
          <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" fill="currentColor" />
        </svg>
      )}
    </span>
  );
}

function CreditLogo({ media, alt }: { media: Media; alt: string }) {
  const url = useMediaUrl(media.path);
  return (
    <span className="lr-credit-logo">{url.data ? <img src={url.data} alt={alt} /> : null}</span>
  );
}

export function MediaView({
  media,
  caption,
  onDuration,
}: {
  media: Media;
  caption: string;
  /** Told the running time once the player knows it, if the block lacked one. */
  onDuration?: (seconds: number) => void;
}) {
  const url = useMediaUrl(media.path);
  const [zoom, setZoom] = useState(false);
  const report = (duration: number) => {
    if (onDuration && !media.seconds && Number.isFinite(duration) && duration > 0) {
      onDuration(Math.round(duration));
    }
  };

  const body = () => {
    if (url.isLoading) return <div className="lr-media-wait">Loading {media.name}…</div>;
    if (!url.data) return <div className="lr-media-wait">{media.name} could not be opened.</div>;
    switch (media.kind) {
      case "audio":
        return (
          <audio
            className="lr-audio"
            controls
            preload="metadata"
            src={url.data}
            onLoadedMetadata={(e) => report(e.currentTarget.duration)}
          />
        );
      case "video":
        return (
          <video
            className="lr-video"
            controls
            preload="metadata"
            src={url.data}
            onLoadedMetadata={(e) => report(e.currentTarget.duration)}
          />
        );
      case "image":
        return (
          <button
            type="button"
            className="lr-image"
            data-zoom={zoom || undefined}
            title={zoom ? "Fit to the page" : "Show at full size"}
            onClick={() => setZoom((z) => !z)}
          >
            <img src={url.data} alt={caption || media.name} />
          </button>
        );
      case "pdf":
        return <iframe className="lr-pdf" src={url.data} title={caption || media.name} />;
      default:
        return (
          <a className="lr-btn" href={url.data} target="_blank" rel="noreferrer">
            Open {media.name}
          </a>
        );
    }
  };

  return (
    <figure className="lr-media" data-kind={media.kind}>
      {body()}
      <figcaption>
        <span>{caption || media.name}</span>
        {url.data && media.kind !== "file" ? (
          <a href={url.data} target="_blank" rel="noreferrer">
            {media.kind === "pdf" ? "Open full screen" : "Open"}
          </a>
        ) : null}
      </figcaption>
    </figure>
  );
}

function QuizView({ block }: { block: Block }) {
  const options = block.options ?? [];
  const right = new Set(block.answers ?? []);
  const many = right.size > 1;
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [shown, setShown] = useState(false);

  const toggle = (i: number) => {
    if (shown) return;
    setPicked((current) => {
      if (!many) return new Set([i]);
      const next = new Set(current);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };
  const correct = shown && picked.size === right.size && [...picked].every((i) => right.has(i));

  return (
    <div className="lr-quiz">
      <div className="lr-label" style={{ color: "var(--lr-action)" }}>
        Practice question · not recorded
      </div>
      <p className="lr-quiz-q">{block.text}</p>
      {many ? <div className="lr-quiz-hint">Choose every answer that applies.</div> : null}
      <div className="lr-quiz-options" role={many ? "group" : "radiogroup"}>
        {options.map((option, i) => {
          const state = !shown
            ? picked.has(i)
              ? "picked"
              : undefined
            : right.has(i)
              ? "right"
              : picked.has(i)
                ? "wrong"
                : undefined;
          return (
            <button
              key={i}
              type="button"
              role={many ? "checkbox" : "radio"}
              aria-checked={picked.has(i)}
              className="lr-quiz-option"
              data-state={state}
              onClick={() => toggle(i)}
            >
              <b>{String.fromCharCode(65 + i)}</b>
              <span>{option}</span>
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
        {!shown ? (
          <button
            type="button"
            className="lr-btn"
            data-primary="true"
            disabled={picked.size === 0}
            onClick={() => setShown(true)}
          >
            Check
          </button>
        ) : (
          <button
            type="button"
            className="lr-btn"
            onClick={() => {
              setShown(false);
              setPicked(new Set());
            }}
          >
            Try again
          </button>
        )}
        {shown ? (
          <span className="lr-quiz-verdict" data-right={correct || undefined}>
            {correct ? "Right." : "Not quite."}
          </span>
        ) : null}
      </div>
      {shown && block.explanation ? <p className="lr-quiz-why">{block.explanation}</p> : null}
    </div>
  );
}

function FlashcardDeck({ title, cards }: { title: string; cards: Flashcard[] }) {
  const [order, setOrder] = useState(() => cards.map((_, i) => i));
  const [at, setAt] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const deck = useMemo(
    () => order.map((i) => cards[i]).filter(Boolean) as Flashcard[],
    [order, cards],
  );
  const card = deck[at];
  if (!card) return null;

  const go = (by: number) => {
    setFlipped(false);
    setAt((n) => (n + by + deck.length) % deck.length);
  };

  return (
    <div className="lr-deck">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div className="lr-label" style={{ color: "var(--lr-action)" }}>
          {title || "Flashcards"} · {at + 1} of {deck.length}
        </div>
        <button
          type="button"
          className="lr-btn"
          onClick={() => {
            const next = [...order];
            for (let i = next.length - 1; i > 0; i -= 1) {
              const j = Math.floor(Math.random() * (i + 1));
              [next[i], next[j]] = [next[j]!, next[i]!];
            }
            setOrder(next);
            setAt(0);
            setFlipped(false);
          }}
        >
          Shuffle
        </button>
      </div>
      <button
        type="button"
        className="lr-card-face"
        data-flipped={flipped || undefined}
        aria-label={
          flipped ? "Answer. Click to see the prompt." : "Prompt. Click to see the answer."
        }
        onClick={() => setFlipped((f) => !f)}
      >
        <span className="lr-label">{flipped ? "Answer" : "Prompt"}</span>
        <span className="lr-card-text">{flipped ? card.back : card.front}</span>
        {!flipped ? <span className="lr-card-hint">Click to turn over</span> : null}
      </button>
      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        <button type="button" className="lr-btn" onClick={() => go(-1)}>
          ← Previous
        </button>
        <button type="button" className="lr-btn" data-primary="true" onClick={() => go(1)}>
          Next →
        </button>
      </div>
    </div>
  );
}

export function TableView({ title, rows }: { title: string; rows: string[][] }) {
  const [head, ...body] = rows;
  if (!head) return null;
  return (
    <figure className="lr-data">
      {title ? <figcaption className="lr-label">{title}</figcaption> : null}
      <div className="lr-data-scroll">
        <table>
          <thead>
            <tr>
              {head.map((cell, i) => (
                <th key={i}>{cell}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, r) => (
              <tr key={r}>
                {head.map((_, c) => (
                  <td key={c}>{row[c] ?? ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
