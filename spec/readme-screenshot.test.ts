import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";

// The README screenshot has to load on the deployed image, which can't run
// Astro's /_image transform (no sharp). So /readme/ links the built file
// itself, and that file is served as the PNG it is.
const baseUrl = inject("baseUrl");

const ALT =
  "The demo plan at 1920×1080: four semesters with flagged placements, and the tally beside them";

describe("readme screenshot", () => {
  it("links the built PNG directly, not through /_image", async () => {
    const res = await fetch(new URL("/readme/", baseUrl));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html, "/readme/ still routes an image through /_image").not.toContain("/_image?");

    const img = new JSDOM(html).window.document.querySelector(`img[alt="${ALT}"]`);
    expect(img, "the demo screenshot, with its alt text, isn't on /readme/").not.toBeNull();
    const src = img?.getAttribute("src") ?? "";
    expect(src).toMatch(/^\/_astro\/demo-1920x1080\.[A-Za-z0-9_-]+\.png$/);

    const file = await fetch(new URL(src, baseUrl));
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("image/png");
  });
});
