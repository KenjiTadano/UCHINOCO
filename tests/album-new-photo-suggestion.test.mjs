import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  detectNewPhotoIds,
  newPhotoSuggestionFingerprint,
  photoIsInPetScope,
  suggestionIsProtected,
} from "../lib/album-new-photo-suggestion-policy.ts";

test("no new photos and duplicate photos are excluded", () => {
  assert.deepEqual(detectNewPhotoIds(["a", "b"], ["a", "b"], []), []);
  assert.deepEqual(detectNewPhotoIds(["a"], ["a", "b", "b"], ["b"]), []);
});

test("one or multiple new photos are detected deterministically", () => {
  assert.deepEqual(detectNewPhotoIds(["a"], ["c", "a", "b"], []), ["b", "c"]);
  assert.deepEqual(detectNewPhotoIds(["a"], ["a", "b"], []), ["b"]);
});

test("dismiss fingerprint is stable and changes when another photo arrives", () => {
  const first = newPhotoSuggestionFingerprint("album", "draft", ["b", "a"]);
  assert.equal(first, newPhotoSuggestionFingerprint("album", "draft", ["a", "b"]));
  assert.notEqual(first, newPhotoSuggestionFingerprint("album", "draft", ["a", "b", "c"]));
});

test("accepted, ordered, ready, and locked albums are protected", () => {
  assert.equal(suggestionIsProtected({ albumStatus: "draft", draftStatus: "generated", accepted: false, ordered: false }), false);
  assert.equal(suggestionIsProtected({ albumStatus: "ready", draftStatus: "generated", accepted: false, ordered: false }), true);
  assert.equal(suggestionIsProtected({ albumStatus: "draft", draftStatus: "locked", accepted: false, ordered: false }), true);
  assert.equal(suggestionIsProtected({ albumStatus: "draft", draftStatus: "generated", accepted: true, ordered: false }), true);
  assert.equal(suggestionIsProtected({ albumStatus: "draft", draftStatus: "generated", accepted: false, ordered: true }), true);
});

test("single and multi-pet scopes exclude unrelated pets", () => {
  assert.equal(photoIsInPetScope("pet-a", ["pet-a"]), true);
  assert.equal(photoIsInPetScope("pet-b", ["pet-a", "pet-b"]), true);
  assert.equal(photoIsInPetScope("pet-c", ["pet-a", "pet-b"]), false);
});

test("safe add does not rewrite persisted draft edits or private photo data into analytics", async () => {
  const actions = await readFile(new URL("../app/(app)/pets/[petId]/album/[albumId]/new-photos/actions.ts", import.meta.url), "utf8");
  assert.doesNotMatch(actions, /album_draft_spreads.*(?:update|delete)|album_draft_frames.*(?:update|delete)|cover_photo_id/);
  assert.doesNotMatch(actions, /storage_path|caption|signed/i);
  assert.match(actions, /photo_count/);
});
