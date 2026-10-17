import { describe, expect, it } from "vitest";
import {
  GUARDIAN_EDITORIAL_QUERY,
  normalizeGuardianVisuals,
  fetchNewsVisuals,
  resolveNewsVisualProvider,
  safeHttpsUrl,
  sanitizeNewsText,
} from "./news-visuals.server";

describe("news visuals safety boundary", () => {
  it("sanitizes markup, entities and control characters", () => {
    expect(sanitizeNewsText("<script>alert(1)</script><b>Deal &amp; law</b>\u0000")).toBe(
      "Deal & law",
    );
  });

  it("accepts only HTTPS URLs from explicitly allowed domains", () => {
    expect(
      safeHttpsUrl("https://media.guim.co.uk/example.jpg#fragment", ["media.guim.co.uk"]),
    ).toBe("https://media.guim.co.uk/example.jpg");
    expect(safeHttpsUrl("http://media.guim.co.uk/example.jpg", ["media.guim.co.uk"])).toBeNull();
    expect(safeHttpsUrl("https://example.com/image.jpg", ["media.guim.co.uk"])).toBeNull();
  });

  it("ignores Guardian items without a safe official thumbnail URL", () => {
    const result = normalizeGuardianVisuals({
      response: {
        status: "ok",
        results: [
          {
            id: "business/example",
            webTitle: "Ghana mining law update",
            webUrl: "https://www.theguardian.com/business/example",
            webPublicationDate: "2026-09-07T05:00:00.000Z",
            fields: {
              headline: "<b>Ghana mining law update</b>",
              thumbnail: "https://media.guim.co.uk/example.jpg",
            },
          },
          {
            id: "business/unsafe",
            webTitle: "Unsafe image",
            webUrl: "https://www.theguardian.com/business/unsafe",
            webPublicationDate: "2026-09-07T05:00:00.000Z",
            fields: { thumbnail: "https://images.example.com/unsafe.jpg" },
          },
          {
            id: "business/unrelated",
            webTitle: "Unrelated European business update",
            webUrl: "https://www.theguardian.com/business/unrelated",
            webPublicationDate: "2026-09-07T05:00:00.000Z",
            fields: { thumbnail: "https://media.guim.co.uk/unrelated.jpg" },
          },
        ],
      },
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.headline).toBe("Ghana mining law update");
  });

  it("requests only the configured jurisdiction and Ghana mining beats", () => {
    expect(GUARDIAN_EDITORIAL_QUERY).toContain("Dubai");
    expect(GUARDIAN_EDITORIAL_QUERY).toContain("United Kingdom");
    expect(GUARDIAN_EDITORIAL_QUERY).toContain("Ghana Gold Board");
    expect(GUARDIAN_EDITORIAL_QUERY).toContain("mining");
  });

  it("requires both an API key and an explicit image-licensing affirmation", () => {
    expect(
      resolveNewsVisualProvider({
        NEWS_VISUALS_PROVIDER: "guardian",
        GUARDIAN_API_KEY: "secret",
      }),
    ).toBeNull();
    expect(
      resolveNewsVisualProvider({
        NEWS_VISUALS_PROVIDER: "guardian",
        GUARDIAN_API_KEY: "secret",
        GUARDIAN_IMAGE_USAGE_LICENSED: "true",
      })?.id,
    ).toBe("guardian");
  });

  it("can be disabled server-side without making a provider request", async () => {
    const result = await fetchNewsVisuals(
      { NEWS_VISUALS_PROVIDER: "none" },
      Date.parse("2026-09-07T05:00:00.000Z"),
    );
    expect(result).toMatchObject({ status: "disabled", provider: null, items: [] });
  });

  it("falls back safely when image licensing is not configured", async () => {
    const result = await fetchNewsVisuals(
      { NEWS_VISUALS_PROVIDER: "guardian", GUARDIAN_API_KEY: "secret" },
      Date.parse("2026-09-07T05:00:00.000Z"),
    );
    expect(result).toMatchObject({ status: "unconfigured", provider: "The Guardian", items: [] });
  });
});
