import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("album GET pages read the draft with the request-scoped Supabase client", async () => {
  const [detail, editor, print] = await Promise.all([
    readFile("./app/(app)/pets/[petId]/album/[albumId]/page.tsx", "utf8"),
    readFile("./app/(app)/pets/[petId]/album/[albumId]/pages/edit/page.tsx", "utf8"),
    readFile("./app/(app)/pets/[petId]/album/[albumId]/print/page.tsx", "utf8"),
  ]);

  for (const source of [detail, editor, print]) {
    assert.match(source, /readDraft\(supabase, albumId\)/);
    assert.doesNotMatch(source, /loadActiveDraft\(albumId\)/);
  }
});

test("album list uses bounded shelf queries instead of signing hundreds of photos", async () => {
  const source = await readFile("./app/(app)/pets/[petId]/album/page.tsx", "utf8");
  assert.match(source, /list\.shelf-months/);
  assert.match(source, /\.limit\(1\)/);
  assert.doesNotMatch(source, /\.limit\(300\)/);
});

test("draft loading traces database and image delivery stages", async () => {
  const source = await readFile("./lib/album-persistence/read-draft.ts", "utf8");
  for (const stage of ["draft.version", "draft.spreads", "draft.elements", "draft.preview-urls"]) {
    assert.match(source, new RegExp(stage.replace(".", "\\.")));
  }
});
