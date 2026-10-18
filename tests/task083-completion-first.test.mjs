import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { planEditorialAlbum, buildEditorialDraft, EditorialGenerationError } from '../lib/album-draft/editorial.ts';
import { searchSafePhotoSubset } from '../lib/album-draft/selection.ts';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/task083-completion-regression.json',import.meta.url),'utf8'));
async function complete(realCaption) {
  const records=fixture.records;
  const photos=records.map(r=>r.photo), geometry=new Map(records.map(r=>[r.photo.photoId,r.analysis]));
  const byId=new Map(records.map(r=>[r.photo.photoId,r]));
  const evaluate=async plan=>{
    const layoutPhotos=plan.selected.map(p=>({...p,analysis:geometry.get(p.photoId),imageUrl:'https://example.com/photo',previewUrl:'https://example.com/photo',bestShot:{candidate:p.candidate,confidence:p.confidence},captionAvailable:realCaption?byId.get(p.photoId).captionAvailable:true}));
    const texts=Object.fromEntries(plan.spreads.map(s=>[s.id,'2020年1月1日']));
    return buildEditorialDraft(plan.spreads,layoutPhotos,texts,undefined,{}, {},12,24,{},undefined,plan.preservedLayouts??{});
  };
  const plan=planEditorialAlbum(photos,24);
  let error;
  try { return {editorial:await evaluate(plan)}; } catch(e) { assert.ok(e instanceof EditorialGenerationError); error=e; }
  return searchSafePhotoSubset({photos,geometry,pageCount:24,unsafeStories:error.currentStories.filter((_,i)=>error.unrecoveredSpreadIndices.includes(i)),initialUnrecoveredCount:error.recoveryStats.unrecoveredCount,currentSelectedCount:error.currentPhotoIds.length,previous:null,budgetExceeded:()=>false,evaluate});
}

for (const realCaption of [false,true]) test(`Task083.2 real-geometry regression completes through unchanged subset search (real caption=${realCaption})`, async()=>{
  const result=await complete(realCaption), album=result.editorial;
  assert.ok(album,JSON.stringify(result.diagnostics));
  assert.equal(album.recovery.unrecoveredCount,0);
  assert.equal(album.spreads.length,12);
  assert.equal(album.selectedPhotoIds.length,19);
  assert.equal(new Set(album.selectedPhotoIds).size,19);
  assert.ok(album.spreads.every(s=>s.status!=='unusable'));
  assert.equal(album.audit.issues.some(i=>i.blocking),false);
  assert.equal(result.diagnostics.subsetSuccessCount,1);
  assert.equal(result.diagnostics.selectedPhotoCount,19);
  assert.ok(album.recovery.editorialDensity);
});

test('anonymous regression fixture contains no real IDs, URLs, captions or storage paths',()=>{
  const text=JSON.stringify(fixture);
  assert.ok(!/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i.test(text));
  assert.ok(!text.includes('https://')&&!text.includes('storage_path'));
  assert.ok(fixture.records.every(r=>r.photo.photoId.startsWith('photo-')&&r.photo.timeline.startsWith('2020-')));
});
