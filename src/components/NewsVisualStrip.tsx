import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, EyeOff, ImageOff } from "lucide-react";
import { getNewsVisuals } from "@/lib/news-visuals.functions";

export default function NewsVisualStrip({ enabled }: { enabled: boolean }) {
  const [failedIds, setFailedIds] = useState<string[]>([]);
  const visuals = useQuery({
    queryKey: ["news-visuals"],
    queryFn: () => getNewsVisuals(),
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  const items = (visuals.data?.items ?? []).filter((item) => !failedIds.includes(item.id));

  if (!enabled)
    return (
      <div className="daily-visuals-placeholder" role="status">
        <EyeOff size={15} aria-hidden="true" />
        <span>News visuals are turned off.</span>
        <Link to="/settings">Enable in Settings</Link>
      </div>
    );

  if (visuals.isPending)
    return (
      <div
        className="daily-visuals-strip is-loading"
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label="Loading news visuals"
      >
        {[0, 1, 2].map((item) => (
          <div className="daily-visuals-card-skeleton" key={item} />
        ))}
        <span className="sr-only">Loading news visuals…</span>
      </div>
    );

  if (visuals.isError || visuals.data?.status !== "ready" || items.length === 0)
    return (
      <div className="daily-visuals-placeholder" role="status">
        <ImageOff size={15} aria-hidden="true" />
        <span>No licensed news images are available right now.</span>
      </div>
    );

  return (
    <nav className="daily-visuals-strip" aria-label="Visual news highlights">
      {items.slice(0, 3).map((item) => (
        <a
          key={item.id}
          className="daily-visuals-card"
          href={item.articleUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`Read ${item.headline} at ${item.source}`}
        >
          <img
            src={item.imageUrl}
            alt={item.imageAlt}
            loading="lazy"
            decoding="async"
            onError={() => setFailedIds((current) => [...new Set([...current, item.id])])}
          />
          <span className="daily-visuals-copy">
            <span className="daily-visuals-source">{item.source}</span>
            <strong>{item.headline}</strong>
          </span>
          <ExternalLink size={12} aria-hidden="true" />
        </a>
      ))}
    </nav>
  );
}
