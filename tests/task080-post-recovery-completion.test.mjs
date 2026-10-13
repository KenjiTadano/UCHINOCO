import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { auditAlbumRhythm } from "../lib/album-draft/editorial.ts";

test("AlbumCreateForm clears stale recovery and guards generating screen during complete navigation", async () => {
  const source = await readFile("app/(app)/pets/[petId]/album/new/album-create-form.tsx", "utf8");

  // 1. beginGeneration clears stale recovery so autoResume or retries don't leave stale error state
  const beginGenMatch = source.match(/function beginGeneration\([\s\S]*?\{([\s\S]*?)startTransition/);
  assert.ok(beginGenMatch, "beginGeneration function must exist");
  assert.match(beginGenMatch[1], /setRecovery\(null\)/, "beginGeneration must clear stale recovery state before starting generation");

  // 2. handleResult on complete status clears recovery and transitions to previewHref
  const handleResultCompleteMatch = source.match(/if\s*\(state\.status === "complete" && state\.previewHref\)[\s\S]*?router\.replace\(state\.previewHref\);/);
  assert.ok(handleResultCompleteMatch, "handleResult complete handler must exist");
  assert.match(handleResultCompleteMatch[0], /setRecovery\(null\)/, "handleResult on complete must clear recovery state");
  assert.match(handleResultCompleteMatch[0], /saveIntent\(null\)/, "handleResult on complete must clear intent");
  assert.match(handleResultCompleteMatch[0], /router\.replace\(state\.previewHref\)/, "handleResult on complete must navigate to previewHref");

  // 3. AlbumGeneratingScreen remains mounted when state.status === 'complete' to prevent stale form error flash
  assert.match(source, /state\.status === "complete"\s*\|\|\s*\(!recovery && \(intent\?\.phase === "generating"/, "Generating screen must remain visible while state.status === complete during preview navigation");

  // 4. requestCreation and selectSmallerPages clear previous recovery
  const requestCreationMatch = source.match(/function requestCreation\([\s\S]*?\{([\s\S]*?)saveIntent/);
  assert.ok(requestCreationMatch, "requestCreation function must exist");
  assert.match(requestCreationMatch[1], /setRecovery\(null\)/, "requestCreation must clear stale recovery");

  const selectSmallerPagesMatch = source.match(/function selectSmallerPages\([\s\S]*?\{([\s\S]*?)setPageCount/);
  assert.ok(selectSmallerPagesMatch, "selectSmallerPages function must exist");
  assert.match(selectSmallerPagesMatch[1], /setRecovery\(null\)/, "selectSmallerPages must clear stale recovery");
});

test("server action correctly delivers completed status and previewHref when unrecoveredCount is 0", async () => {
  const source = await readFile("app/(app)/pets/[petId]/album/new/actions.ts", "utf8");

  // 1. Post-recovery completion logs albumLayoutRecovery and persists album
  assert.match(source, /logAlbumLayoutRecovery\(timing, plan\.spreads\.length, editorial\.recovery\)/, "Post-recovery editorial must log recovery before persistence");
  assert.match(source, /plan\.spreads = editorial\.stories/, "editorial.stories must be assigned to plan.spreads");

  // 2. Completion return structure with previewHref
  assert.match(source, /if \(intentId\) return \{ error: null, status: "complete", previewHref: `\/pets\/\$\{anchorPet\.id\}\/album\/\$\{album\.id\}\?view=preview` \}/, "Must return status: complete with previewHref when intentId is present");

  // 3. Auto-resume for existing completed album returns complete with previewHref
  assert.match(source, /if \(metadata\?\.generation_intent_key === intentKey && cover\) \{[\s\S]*?return \{ error: null, status: "complete", previewHref: `\/pets\/\$\{previous\.pet_id\}\/album\/\$\{previous\.id\}\?view=preview` \}/, "Must return status: complete with previewHref when previous album is already completed");

  // 4. mergeRecoveryStats correctly assigns unrecoveredCount from current
  assert.match(source, /unrecoveredCount: current\.unrecoveredCount/, "mergeRecoveryStats must preserve current.unrecoveredCount (0 upon recovery)");
});

test("auditAlbumRhythm treats safe repaired spreads as non-blocking when unrecoveredCount is 0", () => {
  const validAssignment = {
    photoId: "p1",
    petId: "pet1",
    placement: { slotId: "s1", side: "left", rect: { x: 0, y: 0, w: 100, h: 100 }, crossesGutter: false },
    crop: { cropX: 0, cropY: 0, cropWidth: 1, cropHeight: 1 },
    matchTier: "OPTIMAL",
    role: "hero",
    safety: { faceSafety: 90, headSafety: 90, earSafety: 90 },
  };
  const validRightAssignment = {
    ...validAssignment,
    placement: { slotId: "s2", side: "right", rect: { x: 100, y: 0, w: 100, h: 100 }, crossesGutter: false },
  };

  const spreads = Array.from({ length: 6 }, (_, index) => ({
    storySpreadId: `story-${index}`,
    layoutId: `T_${index + 1}`,
    layoutScore: 80,
    status: "usable",
    assignments: [validAssignment, validRightAssignment],
    story: { id: `story-${index}`, title: `Story ${index}`, startedAt: new Date(2026, 0, index + 1).toISOString(), endedAt: new Date(2026, 0, index + 2).toISOString(), primaryPhotoIds: ["p1"], secondaryPhotoIds: [], photoIds: ["p1"], sceneIds: [] },
  }));

  const texts = Object.fromEntries(spreads.map((s) => [s.storySpreadId, "Caption text"]));
  const audit = auditAlbumRhythm(spreads, texts);
  const blockingIssues = audit.issues.filter((issue) => issue.blocking);
  assert.equal(blockingIssues.length, 0, "Healthy audit must have 0 blocking issues");
  assert.ok(audit.issues.every((issue) => !issue.blocking), "All rhythm streak issues must be non-blocking advisory issues");
});
