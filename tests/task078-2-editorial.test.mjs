import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { parseAlbumSetup } from "../lib/album-setup.ts";
import { planEditorialAlbum, buildEditorialDraft, auditAlbumRhythm, editorialPageText } from "../lib/album-draft/editorial.ts";
import { EDITORIAL_TEMPLATES, EDITORIAL_LIBRARY_SIZE } from "../lib/smart-layout/editorial-library.ts";
import { placeFrames } from "../lib/album-draft/pages.ts";
import { findDraftLayout, toPreviewSpread } from "../lib/album-persistence/preview.ts";
import { polishForLayout } from "../lib/album-polish/catalog.ts";

function ranked(count, pets=2) { return Array.from({length:count},(_,i)=>({photoId:`p${i}`,petId:`pet${i%pets}`,groupId:`g${i}`,timeline:new Date(Date.UTC(2026,7,1+i)).toISOString(),confidence:90,candidate:{photoId:`p${i}`,rank:1,role:"primary",scores:{overall:95-i%20,technical:90,photoIntelligence:90,expression:90,petVisibility:90,composition:90,memoryValue:80,relativeUniqueness:80,sharpness:90,duplicationPenalty:0,sceneRepresentativeness:90}}})); }
function layoutPhotos(input) { return input.map(p=>({photoId:p.photoId,imageUrl:"https://example.com/original",previewUrl:"https://example.com/preview",bestShot:{candidate:p.candidate,confidence:90},analysis:{width:1200,height:1600,orientation:"portrait",focalPoint:{x:.5,y:.4},pets:[{bbox:{x:.35,y:.28,width:.3,height:.36},face:{x:.42,y:.3,width:.16,height:.14},confidence:.95}],analysisConfidence:{petDetection:.95}}})); }
test("setup defaults to all pets and 48 body pages; subsets and Japan custom dates are validated",()=>{
 const form=new FormData(); const now=new Date("2026-10-09T10:00:00Z");
 assert.deepEqual(parseAlbumSetup(form,["pet0","pet1"],now).petIds,["pet0","pet1"]);
 assert.equal(parseAlbumSetup(form,["pet0"],now).pageCount,48);
 form.set("petSelection","selected");form.append("petIds","pet1");form.set("period","custom");form.set("periodFrom","2026-09-01");form.set("periodTo","2026-09-02");
 const setup=parseAlbumSetup(form,["pet0","pet1"],now);assert.deepEqual(setup.petIds,["pet1"]);assert.equal(setup.from.toISOString(),"2026-08-31T15:00:00.000Z");assert.equal(setup.to.toISOString(),"2026-09-02T14:59:59.999Z");
 form.append("petIds","foreign");assert.throws(()=>parseAlbumSetup(form,["pet1"]));
 form.delete("petIds");form.append("petIds","pet1");form.set("periodTo","2026-02-30");assert.throws(()=>parseAlbumSetup(form,["pet1"]));
 form.set("period","3months");form.set("pageCount","36");assert.throws(()=>parseAlbumSetup(form,["pet1"]));
});
test("all 40 designs are registered; body slots retain geometry and do not cross the binding",()=>{
 assert.equal(EDITORIAL_LIBRARY_SIZE,40);assert.equal(new Set(EDITORIAL_TEMPLATES.map(t=>t.id)).size,34);
 for(const t of EDITORIAL_TEMPLATES){assert.equal(findDraftLayout(t.id)?.id,t.id);assert.equal(t.frames.length,t.photoCount);assert.ok(t.similarGroup && t.cropSafety && t.avoidAfter.length);
  const slots=placeFrames(t.frames,new Map());assert.equal(slots.length,t.photoCount);
  for(const a of slots){assert.equal(a.crossesGutter,false);assert.ok(a.rect.w>0 && a.rect.h>0);assert.ok(a.gutterClearance>0);}
  if(t.photoCount>1)assert.deepEqual(new Set(slots.map(s=>s.side)),new Set(["left","right"]));
  else assert.equal(polishForLayout(t.id).text.length,1);
 }
});
for(const pages of [24,48,72])test(`${pages}P budget yields exact nonempty spreads and unique ranked photos`,()=>{
 const input=ranked(110);const plan=planEditorialAlbum(input,pages);
 assert.equal(plan.spreads.length*2,pages);assert.ok(new Set(plan.spreads.map(s=>s.photoIds.length)).size>2);
 const ids=plan.spreads.flatMap(s=>s.photoIds);assert.equal(ids.length,new Set(ids).size);assert.equal(ids.length,plan.selected.length);
 assert.ok(plan.selected.some(p=>p.petId==="pet0") && plan.selected.some(p=>p.petId==="pet1"));
 assert.ok(plan.spreads.every(s=>s.photoIds.length>=1 && s.photoIds.length<=6));
});
test("insufficient, duplicate, alternate and low quality photos cannot pad a book",()=>{
 assert.throws(()=>planEditorialAlbum(ranked(6),24),/少なくとも12枚/);
 const input=ranked(12);input[11].candidate.role="alternate";assert.throws(()=>planEditorialAlbum(input,24));
 input[11].candidate.role="primary";input[11].candidate.scores.technical=0;assert.throws(()=>planEditorialAlbum(input,24));
 assert.throws(()=>planEditorialAlbum(Array(15).fill(ranked(1)[0]),24));
});
test("48P from 36 photos has meaningful single-photo pages and no fabricated photos",()=>{
 const plan=planEditorialAlbum(ranked(36),48);assert.equal(plan.spreads.length,24);assert.equal(plan.spreads.flatMap(s=>s.photoIds).length,36);
});
test("production layout candidates are crop-safe, persistable and audited as a whole book",()=>{
 const plan=planEditorialAlbum(ranked(38),24);const texts=Object.fromEntries(plan.spreads.filter(s=>s.photoIds.length===1).map(s=>[s.id,"2026年8月の思い出"]));
 const result=buildEditorialDraft(plan.spreads,layoutPhotos(plan.selected),texts);
 assert.equal(result.spreads.length,12);assert.ok(!result.audit.issues.some(i=>i.blocking));
 assert.ok(result.audit.layoutCount>=5);assert.ok(result.audit.score>=result.beforeAudit.score);
 assert.ok(!result.audit.issues.some(i=>["REPEATED_TEMPLATE","SIMILAR_TEMPLATE"].includes(i.code)));
 for (const spread of result.spreads) {
   const lead=spread.story.primaryPhotoIds[0];
   const leadArea=Math.max(...spread.assignments.filter(a=>a.photoId===lead).map(a=>a.placement.rect.w*a.placement.rect.h));
   assert.ok(spread.assignments.every(a=>a.placement.rect.w*a.placement.rect.h<=leadArea*1.05));
 }
 const missingText=auditAlbumRhythm(result.spreads,{});assert.ok(missingText.issues.some(i=>i.code==="BLANK_PAGE"));
 const repeated=auditAlbumRhythm(Array(8).fill(result.spreads[1]),texts);assert.ok(repeated.issues.some(i=>i.code==="REPEATED_TEMPLATE"));
 // Saved draft reconstructs the exact geometry and crop aspect used during generation.
 for(const s of result.spreads){const source={id:s.spreadId,storySpreadId:s.storySpreadId,aiLayoutId:s.layoutId,userLayoutId:null,storyType:s.story.storyType,recommendedDensity:s.story.recommendedDensity,importance:s.story.importance,coherence:s.story.coherenceScore,warnings:[]};
  const frames=s.assignments.map((a,i)=>({id:`f${i}`,position:i,frameId:a.frameId,role:a.role,aiPhotoId:a.photoId,userPhotoId:null,aiCropX:a.crop.x,aiCropY:a.crop.y,aiCropScale:a.crop.scale,userCropX:null,userCropY:null,userCropScale:null,matchTier:a.matchTier,cropQuality:a.cropQuality,warnings:[]}));
  const saved=toPreviewSpread(source,frames,new Map());
  assert.deepEqual(saved.assignments.map(a=>a.placement),s.assignments.map(a=>a.placement));
  assert.deepEqual(saved.assignments.map(a=>a.cropFrame.aspectRatio),s.assignments.map(a=>a.cropFrame.aspectRatio));
 }
});
test("creation saves multi-pet drafts, all source IDs and preview-first; Best Shot batching remains intact",()=>{
 const source=readFileSync(new URL("../app/(app)/pets/[petId]/album/new/actions.ts",import.meta.url),"utf8");
 assert.match(source,/buildEditorialDraft/);assert.match(source,/requested_body_pages/);assert.match(source,/generation_photo_ids/);assert.match(source,/\?view=preview/);assert.doesNotMatch(source,/if \(selectedPets.length === 1\)/);
 const shots=readFileSync(new URL("../app/(app)/dev/best-shot/actions.ts",import.meta.url),"utf8");assert.match(shots,/chunkPhotoIds\(photoIds\)/);assert.match(shots,/uniquePhotoIds\(grouped.groups/);
});

test("quiet-page copy meets SQL plain-text and 80-character constraints including emoji",()=>{
 const text=editorialPageText("2026-08-01T10:00:00Z","<script>"+"🐶".repeat(120));
 assert.ok(!/[<>]/.test(text));assert.equal(Array.from(text).length,80);assert.match(text,/2026年8月1日/);
});
