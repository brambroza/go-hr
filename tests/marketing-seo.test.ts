import { test } from "node:test";
import assert from "node:assert/strict";
import { jsonLdScript, landingJsonLd, robotsFor, siteUrl, sitemapFor } from "../lib/marketing/seo";
import { FAQ, LANDING_DESCRIPTION, LANDING_TITLE } from "../lib/marketing/landing-content";

test("siteUrl: keeps a public absolute URL, strips trailing slashes", () => {
  assert.equal(siteUrl("https://hr.goalong.co.th/"), "https://hr.goalong.co.th");
  assert.equal(siteUrl("  https://demo.example.com/app//  "), "https://demo.example.com/app");
});

test("siteUrl: rejects missing, relative, non-http and localhost values", () => {
  for (const v of [undefined, null, "", "hr.example.com", "/x", "ftp://example.com", "javascript:alert(1)", "http://localhost:3000", "http://127.0.0.1"]) {
    assert.equal(siteUrl(v), null, String(v));
  }
});

test("robots: customer install exposes only /careers", () => {
  const r = robotsFor({ marketing: false, base: "https://hr.customer.co.th" });
  assert.deepEqual(r.rules, [{ userAgent: "*", allow: ["/careers"], disallow: ["/"] }]);
  assert.equal(r.sitemap, "https://hr.customer.co.th/sitemap.xml");
});

test("robots: marketing server allows landing + trial and blocks app areas", () => {
  const r = robotsFor({ marketing: true, base: null });
  const rule = r.rules[0];
  assert.ok(rule.allow.includes("/") && rule.allow.includes("/trial"));
  for (const p of ["/api/", "/login", "/m/"]) assert.ok(rule.disallow.includes(p), p);
  assert.equal(r.sitemap, undefined, "no sitemap line without a public base URL");
});

test("sitemap: absolute URLs only, empty without a base", () => {
  assert.deepEqual(sitemapFor({ marketing: true, base: null }), []);
  const m = sitemapFor({ marketing: true, base: "https://demo.example.com" });
  assert.deepEqual(m.map((e) => e.url), ["https://demo.example.com/", "https://demo.example.com/trial"]);
  assert.deepEqual(sitemapFor({ marketing: false, base: "https://hr.c.co" }).map((e) => e.url), ["https://hr.c.co/careers"]);
});

test("json-ld: FAQPage mirrors the visible FAQ and publishes no price or rating", () => {
  const ld = landingJsonLd({ base: "https://demo.example.com", description: LANDING_DESCRIPTION, faq: FAQ });
  const graph = ld["@graph"] as Record<string, unknown>[];
  const faq = graph.find((g) => g["@type"] === "FAQPage") as { mainEntity: { name: string }[] };
  assert.deepEqual(faq.mainEntity.map((q) => q.name), FAQ.map((f) => f.q));
  const app = graph.find((g) => g["@type"] === "SoftwareApplication")!;
  assert.equal(app.offers, undefined);
  assert.equal(app.aggregateRating, undefined);
  assert.equal(app.image, "https://demo.example.com/landing/og-go-hr.png");
});

test("json-ld: works without a base URL (no absolute links)", () => {
  const s = jsonLdScript(landingJsonLd({ base: null, description: "d", faq: [] }));
  assert.ok(!s.includes("localhost"));
  assert.doesNotThrow(() => JSON.parse(s));
});

test("jsonLdScript: a </script> inside a string cannot close the tag", () => {
  const s = jsonLdScript({ a: "</script><script>alert(1)</script>", b: " " });
  assert.ok(!s.includes("<"));
  assert.deepEqual(JSON.parse(s), { a: "</script><script>alert(1)</script>", b: " " });
});

test("landing copy: title and description fit search-result snippets", () => {
  assert.ok(LANDING_TITLE.length <= 65, `title ${LANDING_TITLE.length} chars`);
  assert.ok(LANDING_DESCRIPTION.length >= 100 && LANDING_DESCRIPTION.length <= 170, `description ${LANDING_DESCRIPTION.length} chars`);
  assert.ok(FAQ.length >= 5);
});
