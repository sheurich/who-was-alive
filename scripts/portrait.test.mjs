import assert from "node:assert/strict";
import {
  remotePortrait,
  validThumbnail,
  retainPortrait,
  resetRemotePortrait,
  acceptPortraitCandidate,
} from "./import.mjs";
const item = {
  thumburl:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Test.jpg/240px-Test.jpg",
  descriptionurl: "https://commons.wikimedia.org/wiki/File:Test.jpg",
  sha1: "a".repeat(40),
  extmetadata: {
    LicenseShortName: { value: "CC BY-SA 4.0" },
    LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0/" },
    Artist: { value: "<a>Artist</a>" },
  },
};
assert.equal(remotePortrait(item).artist, "Artist");
assert.equal(remotePortrait(item).path, undefined);
for (const url of [
  "http://upload.wikimedia.org/a",
  "https://upload.wikimedia.org.evil.test/a",
  "https://evil.test/a",
  "https://user@upload.wikimedia.org/a",
  "https://upload.wikimedia.org:4430/a",
])
  assert.equal(validThumbnail(url), false);
assert.equal(
  remotePortrait({
    ...item,
    extmetadata: { ...item.extmetadata, Artist: undefined },
  }),
  null,
);
assert.equal(
  remotePortrait({
    ...item,
    extmetadata: {
      ...item.extmetadata,
      LicenseShortName: { value: "All rights reserved" },
    },
  }),
  null,
);
assert.equal(
  remotePortrait({ ...item, descriptionurl: "https://evil.test/a" }),
  null,
);
const existing = {
  path: "portraits/Q1-a.jpg",
  artist: "Original",
  license: "Public domain",
};
const person = { id: "wd-Q1" };
retainPortrait(person, new Map([["wd-Q1", existing]]));
assert.strictEqual(
  person.portrait,
  existing,
  "Cached object must survive without metadata changes",
);
console.log("Hybrid portrait regression tests passed");

const stale = { portrait: { thumbnailUrl: item.thumburl } };
assert.equal(resetRemotePortrait(stale), true);
assert.equal(
  stale.portrait,
  undefined,
  "Rejected or removed remote portraits cannot survive refresh",
);
assert.equal(resetRemotePortrait(person), false);
assert.strictEqual(
  person.portrait,
  existing,
  "Cached portraits survive refresh reset",
);

const candidate = {
  person: { id: "wd-Q2" },
  id: "Q2",
  filename: "Rejected.jpg",
  alternatives: ["Allowed.jpg", "Unused.jpg"],
};
const queue = [];
assert.equal(acceptPortraitCandidate(candidate, null, queue), "retry");
assert.equal(queue[0].filename, "Allowed.jpg");
assert.deepEqual(queue[0].alternatives, ["Unused.jpg"]);
const accepted = remotePortrait(item);
assert.equal(acceptPortraitCandidate(queue[0], accepted, queue), "added");
assert.strictEqual(candidate.person.portrait, accepted);
assert.equal(queue.length, 1, "Accepted image stops alternate attempts");
assert.equal(
  acceptPortraitCandidate({ ...candidate, alternatives: [] }, null, queue),
  "skipped",
);
