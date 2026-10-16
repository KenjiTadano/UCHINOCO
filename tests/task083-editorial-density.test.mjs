import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyEditorialText, hasMeaningfulEditorialText, editorialDensityMetrics, rebalanceEditorialDensity, MAX_REBALANCE_ATTEMPTS, MAX_REBALANCE_LAYOUTS, completionFirstEditorialQuality } from '../lib/album-draft/editorial-density.ts';
import { buildEditorialDraft, auditAlbumRhythm, sourceSubjectClipped } from '../lib/album-draft/editorial.ts';
import { buildSpreadDraft } from '../lib/album-draft/draft.ts';
import { EDITORIAL_TEMPLATES } from '../lib/smart-layout/editorial-library.ts';
function ranked(count, pets = 2) {
  return Array.from({ length: count }, (_, i) => ({
    photoId: `p${i}`,
    petId: `pet${i % pets}`,
    groupId: `g${i}`,
    timeline: new Date(Date.UTC(2026, 7, 1 + i)).toISOString(),
    confidence: 90,
    candidate: { photoId: `p${i}`, rank: 1, role: "primary", scores: { overall: 95 - (i % 20), technical: 90, photoIntelligence: 90, expression: 90, petVisibility: 90, composition: 90, memoryValue: 80, relativeUniqueness: 80, sharpness: 90, duplicationPenalty: 0, sceneRepresentativeness: 90 } },
  }));
}
function layoutPhotos(input) {
  return input.map((p) => ({
    photoId: p.photoId,
    petId: p.petId,
    timeline: p.timeline,
    groupId: p.groupId,
    scene: p.scene,
    activity: p.activity,
    imageUrl: "https://example.com/original",
    previewUrl: "https://example.com/preview",
    bestShot: { candidate: p.candidate, confidence: 90 },
    analysis: { width: 1200, height: 1600, orientation: "portrait", focalPoint: { x: 0.5, y: 0.4 }, pets: [{ bbox: { x: 0.35, y: 0.28, width: 0.3, height: 0.36 }, face: { x: 0.42, y: 0.3, width: 0.16, height: 0.14 }, confidence: 0.95 }], analysisConfidence: { petDetection: 0.95 } },
  }));
}

function fixture(counts) {
  const photos = layoutPhotos(ranked(counts.reduce((a,b)=>a+b,0), 1));
  for (const p of photos) { p.groupId = 'scene'; p.timeline = '2026-10-09T10:00:00Z'; p.captionAvailable = false; }
  let offset = 0;
  const stories = counts.map((count,i) => {
    const ids = photos.slice(offset, offset+count).map(p=>p.photoId); offset += count;
    return { id:`editorial-${i+1}`, photoIds:ids, primaryPhotoIds:[ids[0]], secondaryPhotoIds:ids.slice(1), sceneIds:['scene'], startedAt:photos[0].timeline, endedAt:photos[0].timeline, storyType:count===1?'single':'sequence', theme:{}, coherenceScore:100, importance:90, recommendedDensity:count===1?'hero':'medium', warnings:[], analysisVersion:'fixture' };
  });
  const texts = Object.fromEntries(stories.map(s=>[s.id,'2026年10月9日']));
  return { photos, stories, texts };
}
function evaluate(f, story, index) {
  if (story.photoIds.some(id=>sourceSubjectClipped(f.photos.find(p=>p.photoId===id)))) return {drafts:[], rejection:'sourceClipping'};
  const layouts = EDITORIAL_TEMPLATES.filter(l=>l.photoCount===story.photoIds.length && (index===f.stories.length-1 || l.id!=='E_CLOSING')).slice(0,MAX_REBALANCE_LAYOUTS);
  const drafts = layouts.map(l=>buildSpreadDraft(story,f.photos,undefined,[l.id])).filter(d=>d.status!=='unusable');
  return { drafts, rejection:'cropSafety' };
}
function baseline(f) { return f.stories.map((s,i)=>evaluate(f,s,i).drafts[0]); }
function run(f, overrides={}) {
  return rebalanceEditorialDensity({ ...f, spreads:baseline(f), evaluate:(s,i)=>evaluate(f,s,i), validBook:s=>!auditAlbumRhythm(s,f.texts).issues.some(i=>i.blocking), ...overrides });
}

test('text classification separates date-only, factual captions and explicit provenance',()=>{
  assert.equal(classifyEditorialText(null),'none');
  assert.equal(classifyEditorialText('2026年10月9日'),'dateOnly');
  assert.equal(classifyEditorialText('2026年10月9日\n公園で遊んだ'),'meaningfulCaption');
  assert.equal(classifyEditorialText('誕生日','title/event'),'title/event');
  assert.equal(classifyEditorialText('思い出','userProvided'),'userProvided');
  assert.equal(hasMeaningfulEditorialText('2026年10月9日'),false);
  assert.equal(classifyEditorialText('2026年10月9日\n2026年10月9日'), 'dateOnly');
  assert.equal(classifyEditorialText('2026年10月9日','userProvided'), 'dateOnly');
});

test('A/D: safe 1+3 becomes 2+2 with fewer date-only pages and identical photo set',()=>{
  const f=fixture([1,3]), result=run(f);
  assert.deepEqual(result.stories.map(s=>s.photoIds.length),[2,2]);
  assert.equal(result.diagnostics.initialDateOnlyPageCount,1);
  assert.equal(result.diagnostics.finalDateOnlyPageCount,0);
  assert.deepEqual(result.stories.flatMap(s=>s.photoIds).sort(),f.stories.flatMap(s=>s.photoIds).sort());
  assert.ok(result.spreads.every(s=>s.status!=='unusable'));
});

test('B: unsafe candidate keeps original valid composition and explains fallback',()=>{
  const f=fixture([1,3]); const original=baseline(f);
  const result=run(f,{evaluate:()=>({drafts:[],rejection:'cropSafety'})});
  assert.deepEqual(result.spreads,original);
  assert.equal(result.diagnostics.finalDateOnlyPageCount,1);
  assert.ok(result.diagnostics.rebalanceFailureReasonCounts.cropSafety>0);
});

test('C: meaningful caption single retains its editorial page',()=>{
  const f=fixture([1,3]); f.texts[f.stories[0].id]+='\n公園で遊んだ';
  const result=run(f);
  assert.deepEqual(result.stories,f.stories);
  assert.equal(result.diagnostics.meaningfulTextOnlyPageCount,1);
  assert.equal(result.diagnostics.rebalanceAttemptCount,0);
});

test('chronology, pet grouping and scene constraints reject incompatible moves',()=>{
  for (const reason of ['chronologyConstraint','petBalanceConstraint','sceneConstraint']) {
    const f=fixture([1,3]);
    if(reason==='chronologyConstraint') { f.photos[0].timeline='2026-10-08T10:00:00Z'; f.stories[0].startedAt=f.photos[0].timeline; f.stories[0].endedAt=f.photos[0].timeline; for (const p of f.photos.slice(2)) p.timeline='2026-10-10T10:00:00Z'; }
    if(reason==='petBalanceConstraint') f.photos[0].petId='other-pet';
    if(reason==='sceneConstraint') f.photos[0].groupId='other-scene';
    const result=run(f); assert.equal(result.diagnostics.rebalanceSuccessCount,0); assert.ok(result.diagnostics.rebalanceFailureReasonCounts[reason]>0, reason);
  }
});

test('search is deterministic and strictly bounded with a usable original fallback',()=>{
  const f=fixture([1,1,1,1,1,1,1,1,1,1,1,3,3,3,3]);
  const options={evaluate:()=>({drafts:[],rejection:'cropSafety'})};
  const a=run(f,options), b=run(f,options);
  assert.deepEqual(a,b); assert.ok(a.diagnostics.rebalanceAttemptCount<=MAX_REBALANCE_ATTEMPTS);
  assert.ok(a.diagnostics.rebalanceFailureReasonCounts.boundedSearchExhausted>0);
});

test('E/F/H: 19-photo safe-subset-shaped 24P fixture completes, closes only at end, and improves 7 to 5',()=>{
  const f=fixture([1,2,3,1,2,2,1,1,3,1,1,1]);
  const result=buildEditorialDraft(f.stories,f.photos,f.texts);
  assert.equal(result.spreads.length,12);
  assert.equal(result.selectedPhotoIds.length,19);
  assert.deepEqual([...result.selectedPhotoIds].sort(),f.photos.map(p=>p.photoId).sort());
  assert.equal(result.recovery.unrecoveredCount,0);
  assert.equal(result.recovery.editorialDensity.initialDateOnlyPageCount,7);
  assert.ok(result.recovery.editorialDensity.finalDateOnlyPageCount<=5,JSON.stringify(result.recovery.editorialDensity));
  assert.ok(result.spreads.every((s,i)=>s.layoutId!=='E_CLOSING'||i===11));
  assert.ok(result.recovery.editorialDensity.closingSparseSpreadCount<=1);
  assert.equal(result.audit.issues.some(i=>i.blocking),false);
});

test('Closing is still an available final-position layout with no fabricated photo page',()=>{
  const f=fixture([2,1]);
  const result=buildEditorialDraft(f.stories,f.photos,f.texts,undefined,{}, {},2,3,{},undefined,{[f.stories[1].id]:'E_CLOSING'});
  assert.equal(result.spreads[1].layoutId,'E_CLOSING');
  assert.equal(editorialDensityMetrics(result.spreads,f.texts).closingSparseSpreadCount,1);
});


test('real crop evaluator rejects unsafe redistributed geometry without discarding the safe baseline',()=>{
  const f=fixture([1,3]);
  const unsafePhotos=f.photos.map(p=>({...p,analysis:{...p.analysis,pets:[{bbox:{x:.01,y:.01,width:.98,height:.98},face:{x:.01,y:.01,width:.98,height:.98},confidence:.95}]}}));
  const result=run(f,{evaluate:(s,i)=>evaluate({...f,photos:unsafePhotos},s,i)});
  assert.equal(result.diagnostics.rebalanceSuccessCount,0);
  assert.ok(result.diagnostics.rebalanceFailureReasonCounts.cropSafety>0);
  assert.deepEqual(result.spreads,baseline(f));
});

test('source clipping is a hard rejection in redistribution',()=>{
  const f=fixture([1,3]), unsafePhotos=f.photos.map(p=>({...p,analysis:{...p.analysis,pets:[{bbox:{x:0,y:.1,width:.5,height:.5},confidence:.95}]}}));
  const result=run(f,{evaluate:(s,i)=>evaluate({...f,photos:unsafePhotos},s,i)});
  assert.equal(result.diagnostics.rebalanceSuccessCount,0);
  assert.ok(result.diagnostics.rebalanceFailureReasonCounts.sourceClipping>0);
});


test('G: full planner repeats the same assignments and density diagnostics',()=>{
  const f=fixture([1,2,3,1,2,2,1,1,3,1,1,1]);
  const a=buildEditorialDraft(f.stories,f.photos,f.texts), b=buildEditorialDraft(f.stories,f.photos,f.texts);
  assert.deepEqual(a.spreads,b.spreads);
  assert.deepEqual(a.recovery.editorialDensity,b.recovery.editorialDensity);
});

test('E: intermediate Closing is handled after completion and never breaks its audit',()=>{
  const f=fixture([1,2,3,1,2,2,1,1,3,1,1,1]);
  const result=buildEditorialDraft(f.stories,f.photos,f.texts,undefined,{}, {},12,19,{},undefined,{[f.stories[6].id]:'E_CLOSING'});
  assert.equal(result.recovery.unrecoveredCount,0);
  assert.ok(!result.audit.issues.some(i=>i.blocking));
  assert.ok(result.recovery.editorialDensity.closingCleanupAttemptCount>0);
});


for (const accepted of [true,false]) test(`Closing cleanup ${accepted?'accepts an audited improvement':'retains the baseline on REPEATED_TEMPLATE'}`,()=>{
  const f=fixture([1,1]);
  const spreads=f.stories.map((s,i)=>buildSpreadDraft(s,f.photos,undefined,[i===0?'E_CLOSING':'E_1_RIGHT_FULL']));
  assert.ok(spreads.every(s=>s.status!=='unusable'));
  const candidate=buildSpreadDraft(f.stories[0],f.photos,undefined,[accepted?'E_1_LEFT_WIDE':'E_1_RIGHT_FULL']);
  const result=completionFirstEditorialQuality({...f,spreads,evaluate:()=>({drafts:[candidate],rejection:null}),validBook:s=>!auditAlbumRhythm(s,f.texts).issues.some(i=>i.blocking)});
  assert.equal(result.diagnostics.initialClosingSparseSpreadCount,1);
  assert.equal(result.diagnostics.finalClosingSparseSpreadCount,accepted?0:1);
  assert.equal(result.diagnostics.closingCleanupSuccessCount,accepted?1:0);
  assert.equal(result.diagnostics.closingCleanupAttemptCount,1);
  if(!accepted) { assert.deepEqual(result.spreads,spreads); assert.ok(result.diagnostics.closingCleanupFailureReasonCounts.blockingAudit>0); }
  assert.ok(!auditAlbumRhythm(result.spreads,f.texts).issues.some(i=>i.blocking));
});

test('density evaluation errors preserve completed baseline rather than escaping as action_required',()=>{
  const f=fixture([1,3]);
  const evaluate=(story,...args)=>{
    if(story.photoIds.length===2) throw new Error('quality evaluation failure');
    return buildSpreadDraft(story,...args);
  };
  const result=buildEditorialDraft(f.stories,f.photos,f.texts,undefined,{}, {},2,4,{},evaluate);
  assert.equal(result.recovery.unrecoveredCount,0);
  assert.deepEqual(result.stories.map(s=>s.photoIds.length),[1,3]);
  assert.equal(result.recovery.editorialDensity.closingCleanupFailureReasonCounts.qualityPassRolledBack,1);
  assert.ok(!result.audit.issues.some(i=>i.blocking));
});
