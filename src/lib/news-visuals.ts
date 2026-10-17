export const NEWS_VISUALS_PREFERENCE_KEY = "px.daily-briefing.visuals.enabled";

export type NewsVisual = {
  id: string;
  source: string;
  headline: string;
  articleUrl: string;
  imageUrl: string;
  imageAlt: string;
  publishedAt: string;
};

export type NewsVisualsStatus = "ready" | "empty" | "disabled" | "unconfigured" | "error";

export type NewsVisualsResult = {
  status: NewsVisualsStatus;
  provider: string | null;
  fetchedAt: string;
  items: NewsVisual[];
};
