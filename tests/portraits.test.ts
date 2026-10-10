import test from "node:test";
import assert from "node:assert/strict";
import { portraitSource } from "../src/portraits.ts";

const remote =
  "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Test.jpg/250px-Test.jpg";
const credit = {
  source: "https://commons.wikimedia.org/wiki/File:Test.jpg",
  artist: "Artist",
  license: "CC BY 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
};

test("cached portraits remain preferred and work under a subpath", () => {
  assert.equal(
    portraitSource(
      { ...credit, path: "portraits/test.jpg", thumbnailUrl: remote },
      "/lifetimes/",
    ),
    "/lifetimes/portraits/test.jpg",
  );
});
test("remote thumbnails load only from allowed HTTPS Wikimedia hosts", () => {
  assert.equal(
    portraitSource({ ...credit, thumbnailUrl: remote }, "./"),
    remote,
  );
  for (const thumbnailUrl of [
    "http://thumb.wikimedia.org/x",
    "https://evil.example/x",
    "https://thumb.wikimedia.org.evil.example/x",
    "https://user:pass@thumb.wikimedia.org/x",
    "https://thumb.wikimedia.org:8080/x",
    "javascript:alert(1)",
  ]) {
    assert.equal(portraitSource({ ...credit, thumbnailUrl }, "./"), null);
  }
  assert.equal(
    portraitSource({ ...credit, path: "../secret.jpg" }, "./"),
    null,
  );
});
test("failed images fall back once and stop retrying failed sources", () => {
  const portrait = {
    ...credit,
    path: "portraits/test.jpg",
    thumbnailUrl: remote,
  };
  const failed = new Set(["./portraits/test.jpg"]);
  assert.equal(portraitSource(portrait, "./", failed), remote);
  failed.add(remote);
  assert.equal(portraitSource(portrait, "./", failed), null);
  assert.equal(portraitSource(undefined, "./"), null);
});
