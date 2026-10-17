import { describe, expect, it } from "vitest";
import { isFetchableUrl, parseLinkPreview } from "./link-preview";

describe("link preview", () => {
  it("reads a page's picture, title and description", () => {
    const html = `<html><head><title>Fallback</title>
      <meta property="og:title" content="Income Tax Act &amp; regulations">
      <meta name="description" content="What is taxed, and when.">
      <meta content="/img/share.png" property="og:image" />
      <meta property="og:site_name" content="Ghana Revenue Authority">
    </head></html>`;
    expect(parseLinkPreview(html, "https://gra.gov.gh/acts/income-tax")).toEqual({
      image: "https://gra.gov.gh/img/share.png",
      title: "Income Tax Act & regulations",
      description: "What is taxed, and when.",
      site: "Ghana Revenue Authority",
    });
  });

  it("falls back to the <title> and the host, and refuses odd image links", () => {
    const html = `<title> A page </title><meta property="og:image" content="javascript:alert(1)">`;
    expect(parseLinkPreview(html, "https://www.example.com/x")).toEqual({
      image: null,
      title: "A page",
      description: "",
      site: "example.com",
    });
  });

  it("only lets the server fetch public web addresses", () => {
    expect(isFetchableUrl("https://legislation.gov.gh/act/992")).toBe(true);
    expect(isFetchableUrl("http://8.8.8.8/x")).toBe(true);
    for (const bad of [
      "ftp://example.com",
      "http://localhost:8085",
      "http://127.0.0.1/",
      "http://10.0.0.5/",
      "http://192.168.1.1/",
      "http://172.20.0.1/",
      "http://169.254.169.254/latest/meta-data",
      "http://[::1]/",
      "https://user:pass@example.com",
      "not a url",
    ])
      expect(isFetchableUrl(bad)).toBe(false);
  });
});
