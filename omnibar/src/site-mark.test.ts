import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  brandColor,
  faviconUrl,
  historyLinkLogo,
  siteIcon,
  SQUIRCLE_MASK,
} from "./site-mark";

describe("faviconUrl", () => {
  it("asks Google for the site's icon", () => {
    assert.equal(
      faviconUrl("www.youtube.com"),
      "https://www.google.com/s2/favicons?domain=youtube.com&sz=128",
    );
  });
});

describe("brandColor", () => {
  it("uses the site's main color", () => {
    assert.equal(brandColor("youtube", ["youtube.com"]), "#FF0000");
    assert.equal(brandColor("YouTube", ["youtu.be"]), "#FF0000");
  });

  it("keeps an explicit engine color", () => {
    assert.equal(brandColor("youtube", ["youtube.com"], "#112233"), "#112233");
  });

  it("picks a stable hue when the site is unknown", () => {
    const first = brandColor("example", ["example.com"]);
    const second = brandColor("example", ["example.com"]);
    assert.equal(first, second);
    assert.match(first, /^hsl\(\d+, 70%, 55%\)$/);
  });
});

describe("historyLinkLogo", () => {
  it("uses the link's own site logo beside the history icon with rounded corners", () => {
    assert.deepEqual(historyLinkLogo("github.com"), {
      source: faviconUrl("github.com"),
      mask: SQUIRCLE_MASK,
    });
    assert.equal(historyLinkLogo("github.com")?.mask, "roundedRectangle");
    assert.equal(historyLinkLogo("  "), null);
  });
});

describe("siteIcon", () => {
  it("uses the first domain as the logo with squircle rounded corners", () => {
    assert.deepEqual(siteIcon(["youtube.com", "youtu.be"]), {
      source: faviconUrl("youtube.com"),
      mask: SQUIRCLE_MASK,
    });
    assert.equal(siteIcon(["youtube.com"])?.mask, "roundedRectangle");
  });

  it("has no logo without a domain", () => {
    assert.equal(siteIcon([]), null);
    assert.equal(siteIcon(["  "]), null);
  });
});
