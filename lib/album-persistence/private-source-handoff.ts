import {headingSync,headingDuration} from "../heading-trace-core.ts";
import "server-only";
import { publishPrivateProposal, type PublicationDiagnostic } from "./private-source-publication";
import { headers } from "next/headers";
import { createPrivateKey, createPublicKey, sign } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createPhotoPreviewUrls } from "../photo-image-delivery";
import { canUsePhotoInAlbum } from "./photo-eligibility";
import { executePrivateHandoff, parseHandoffIntent, verifySealedHandoff, handoffEpochMatches, type HandoffAudit } from "./private-source-handoff-core";
function publicationAudit(value: PublicationDiagnostic) { if(process.env.VERCEL_ENV==="preview") console.info("Private source publication",JSON.stringify(value)); }
function audit(value: HandoffAudit) { console.info("Private source handoff",JSON.stringify(value)); }
/** No route/action/UI is exported. Only the authorized Edit server pipeline calls this. */
export async function runPrivateSourceHandoff(supabase: SupabaseClient,albumId: string,petId: string,fresh: Map<string,string>) {
  if (process.env.EDIT_SOURCE_HANDOFF_ENABLE !== "true") return null;
  const runtime={environment:process.env.VERCEL_ENV,build:process.env.VERCEL_GIT_COMMIT_SHA,region:process.env.VERCEL_REGION};
  const m=headingSync("admission.intent",()=>parseHandoffIntent(process.env.EDIT_SOURCE_HANDOFF_INTENT,process.env.EDIT_SOURCE_HANDOFF_PIN,runtime));
  if (!m || !process.env.VERCEL_PROJECT_ID) {
    audit({outcome:"invalid-intent",count:0,bindingCount:0,environment:["preview","production"].includes(runtime.environment??"")?runtime.environment!:"unknown",region:runtime.region==="sin1"?"sin1":"unknown",buildMatch:false,epochMatch:false});return {handled:true};
  }
  const controlBegan=performance.now();
  let control: unknown;
  try {
    const id=process.env.EDIT_SOURCE_CANARY_CONTROL_ID,token=process.env.EDIT_SOURCE_CANARY_CONTROL_TOKEN;
    if(!id||!/^ecfg_[a-zA-Z0-9]+$/.test(id)||!token)throw new Error("Unavailable");
    const r=await fetch(`https://global-config.vercel.com/${id}/item/editReuse`,{headers:{Authorization:`Bearer ${token}`},cache:"no-store",signal:AbortSignal.timeout(200)});
    if(!r.ok)throw new Error("Unavailable");control=await r.json();
  } catch {audit({outcome:"control-unavailable",count:0,bindingCount:0,environment:m.environment,region:m.region,buildMatch:true,epochMatch:false});return {handled:true}}
  const controlElapsedMs=Math.round(performance.now()-controlBegan);
  headingDuration("source.control.remote",controlElapsedMs);
  if((control as {phase?:string})?.phase==="trial"){
    const sealed=headingSync("admission.seal",()=>verifySealedHandoff(m,control,runtime));
    if(sealed)return {handled:true,canary:{...sealed,control:control as {enabled:boolean;validUntil:number},controlElapsedMs}};
    audit({outcome:"invalid-seal",count:0,bindingCount:0,environment:m.environment,region:m.region,buildMatch:true,epochMatch:false});return {handled:true};
  }
  const requestHeaders=await headers();
  if(requestHeaders.get("sec-fetch-dest")!=="document"||requestHeaders.has("rsc")||requestHeaders.has("next-router-prefetch"))return {handled:true};
  let authorizedPetIds: string[] = [];
  await executePrivateHandoff(m,process.env.VERCEL_PROJECT_ID,albumId,petId,fresh,{
    async control(){return control},
    async authenticate(){
      const {data:{user},error}=await supabase.auth.getUser();if(error||!user)return null;
      const session=await supabase.auth.getSession();if(session.error||!session.data.session)return null;
      const s=session.data.session;return {verifiedUserId:user.id,sessionUserId:s.user.id,accessToken:s.access_token,sessionExpiresAt:(s.expires_at??0)*1000};
    },
    async authorize(c,a,p,ids){
      const album=await supabase.from("albums").select("id,pet_id,owner_user_id").eq("id",a).eq("owner_user_id",c.verifiedUserId).eq("pet_id",p).maybeSingle();
      if(album.error||!album.data)return false;
      const owner=album.data.owner_user_id;
      const links=await supabase.from("album_pets").select("pet_id").eq("album_id",a);if(links.error||!links.data?.length)return false;
      const pets=[...new Set(links.data.map(r=>r.pet_id))];if(!pets.includes(p))return false;
      const owned=await supabase.from("pets").select("id").in("id",pets).eq("owner_user_id",c.verifiedUserId);if(owned.error||owned.data?.length!==pets.length)return false;
      const photos=await supabase.from("photos").select("id,pet_id,uploader_user_id").in("id",ids);
      const valid = !photos.error&&photos.data?.length===ids.length&&photos.data.every(r=>canUsePhotoInAlbum({ownerUserId:owner,allowedPetIds:pets},r,c.verifiedUserId));
      if(valid) authorizedPetIds=pets;return valid;
    },
    async sign(c,ids){
      const rows=await supabase.from("photos").select("id,storage_path,thumbnail_path").in("id",ids).in("pet_id",authorizedPetIds).eq("uploader_user_id",c.verifiedUserId);
      if(rows.error||rows.data?.length!==ids.length)throw new Error("Unavailable");
      return createPhotoPreviewUrls(supabase,rows.data,true,false,c.verifiedUserId);
    },
    async unchangedSession(c){const s=await supabase.auth.getSession();return !s.error&&s.data.session?.access_token===c.accessToken&&s.data.session.user.id===c.verifiedUserId},
    async publish(slot,proposal){
      let publication: {head:string;put:string;value:string;validUntil:number};
      try {
        const key=process.env.EDIT_SOURCE_HANDOFF_SIGNING_KEY;
        const grants=JSON.parse(process.env.EDIT_SOURCE_HANDOFF_BLOB_GRANTS??"null");
        if(!key||!Array.isArray(grants)||grants.length!==m.slots.length)throw new Error("Invalid grant");
        const grant=grants[slot],headUrl=new URL(grant.head),putUrl=new URL(grant.put);
        if(grant.validUntil!==(m.startWindow+2)*300000||Date.now()>=grant.validUntil||headUrl.protocol!=="https:"||!headUrl.hostname.endsWith(".private.blob.vercel-storage.com")||putUrl.protocol!=="https:"||putUrl.hostname!=="vercel.com"||!["/api/blob","/api/blob/"].includes(putUrl.pathname))throw new Error("Invalid grant");
        const expectedPath=`admission/${m.nonce}/slot-${slot}.json`;
        if(decodeURIComponent(headUrl.pathname)!=="/"+expectedPath||putUrl.searchParams.get("pathname")!==expectedPath||putUrl.searchParams.get("vercel-blob-allow-overwrite")!=="false"||putUrl.searchParams.get("vercel-blob-add-random-suffix")!=="false"||putUrl.searchParams.get("vercel-blob-maximum-size-in-bytes")!=="8192"||createPublicKey(createPrivateKey(key)).export({format:"pem",type:"spki"}).toString()!==m.proposalPublicKey)throw new Error("Invalid grant");
        const value=JSON.stringify({proposal,signature:sign(null,Buffer.from(JSON.stringify(proposal)),createPrivateKey(key)).toString("base64url")});
        if(Buffer.byteLength(value)>8192)throw new Error("Invalid grant");
        if(!handoffEpochMatches(m))throw new Error("Invalid grant");
        publication={head:headUrl.toString(),put:putUrl.toString(),value,validUntil:grant.validUntil};
      } catch {
        publicationAudit({stage:"grant-validated",success:false,elapsedMs:0,statusCategory:"none",responseShape:"not-observed",committedObjectObserved:false});
        return "failed";
      }
      return publishPrivateProposal(publication,{audit:publicationAudit});
    },
    audit,publicationAudit,
  });
  // Active enrollment never performs reuse, including all failure paths.
  return {handled:true};
}
