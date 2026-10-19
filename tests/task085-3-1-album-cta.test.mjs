import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {requestModules} from './helpers/album-request-modules.mjs';
const base='app/(app)/pets/[petId]/album/[albumId]/';
const pet='10000000-0000-4000-8000-000000000001',album='20000000-0000-4000-8000-000000000001';
const navigation={redirect(href){throw Object.assign(new Error('redirect'),{redirect:true,href});},unstable_rethrow(e){if(e.redirect)throw e;}};
function fixture(options={}){
 const calls=[],events=[];
 const db={auth:{getUser:async()=>({data:{user:options.noUser?null:{id:'synthetic-owner'}}})},from(table){const filters=[];const q={select(){return q},eq(k,v){filters.push([k,v]);return q},order(){return q},limit(){return q},async maybeSingle(){calls.push({table,filters});return {data:table==='albums'?(options.noAlbum?null:{id:album}):null};}};return q;}};
 const load=requestModules({'next/navigation':navigation,'@/lib/supabase/server':{createClient:async()=>db},'@/lib/album-persistence/read-draft':{readDraft:async()=>{if(options.readFailure)throw Error('read failed');return options.noDraft?null:{versionId:'synthetic-version'};}},'@/lib/album-analytics':{calculateAlbumEditMetrics:()=>({}),analyticsAcceptData:()=>({category:'DIRECT_ACCEPT'})},'@/lib/album-analytics-server':{recordAlbumAnalyticsEvent:async event=>{events.push(event);return !options.recordFailure;}},'@/lib/entitlements-server':{loadUserEntitlements:async()=>({})}});
 return {actions:load(base+'analytics-actions.ts'),calls,events};
}
test('Preview confirmation preserves owner/pet checks and acceptance analytics before print guard',async()=>{
 const f=fixture();await assert.rejects(f.actions.acceptAlbumForOrder(pet,album),e=>e.redirect&&e.href===`/pets/${pet}/album/${album}/print`);assert.equal(f.events.length,1);assert.equal(f.events[0].eventType,'album_accepted');assert.equal(f.events[0].draftVersionId,'synthetic-version');assert.deepEqual(f.calls[0].filters,[['id',album],['pet_id',pet],['owner_user_id','synthetic-owner']]);assert.ok(!f.calls.some(c=>c.table==='orders'||c.table==='album_print_snapshots'));
});
test('legacy acceptance keeps Preview redirect; arbitrary destinations cannot become redirects',async()=>{
 const f=fixture();await assert.rejects(f.actions.acceptAlbumDraft(pet,album),e=>e.href.endsWith('?view=preview'));await assert.rejects(f.actions.acceptAlbumDraft(pet,album,'https://evil.test'),e=>e.href.endsWith('?view=preview'));
});
test('invalid, unauthorized, missing draft and persistence errors return retryable message without order navigation',async()=>{
 for(const options of [{noAlbum:true},{noDraft:true},{readFailure:true},{recordFailure:true}]){const f=fixture(options);const result=await f.actions.acceptAlbumForOrder(pet,album);assert.ok(result.message);}
 const f=fixture();assert.ok((await f.actions.acceptAlbumForOrder('invalid',album)).message);assert.equal(f.calls.length,0);
 const auth=fixture({noUser:true});await assert.rejects(auth.actions.acceptAlbumForOrder(pet,album),e=>e.redirect&&e.href==='/login');
});
test('completion has one primary and exact new labels; edit and cover routes stay explicit',()=>{
 const complete=fs.readFileSync(base+'album-complete-screen.tsx','utf8'),page=fs.readFileSync(base+'page.tsx','utf8'),preview=fs.readFileSync(base+'album-preview-screen.tsx','utf8');assert.equal((complete.match(/className="ai-complete-primary/g)||[]).length,1);for(const label of ['アルバムを確認する','写真・レイアウトを編集する','印刷イメージを確認する'])assert.ok(complete.includes(label));assert.ok(!complete.includes('acceptAction'));assert.ok(!complete.includes('このままでOK'));assert.match(page,/editHref=\{`\$\{base\}\/edit`\}/);assert.match(page,/coverEditHref=\{`\$\{base\}\/cover\/edit`\}/);assert.match(preview,/編集を続ける/);const edit=fs.readFileSync(base+'edit/page.tsx','utf8');assert.match(edit,/backHref=\{`\$\{base\}\?view=preview`\}/);assert.match(edit,/doneHref=\{`\$\{base\}\?view=preview`\}/);
});
function clientFixture(pending=false,message=null){let submit;const jsx=(type,props)=>({type,props});const load=requestModules({'react/jsx-runtime':{jsx,jsxs:jsx},react:{useActionState(fn){submit=fn;return [{message},()=>{},pending];}},'next/navigation':navigation,'lucide-react':{ArrowRight:'arrow',BookOpen:'book'}});return {Component:load(base+'album-order-intent-cta.tsx').AlbumOrderIntentCta,get submit(){return submit;}};}
const flatten=node=>[node,...(Array.isArray(node?.props?.children)?node.props.children:[node?.props?.children]).filter(v=>v&&typeof v==='object').flatMap(flatten)];
test('order intent exposes pending/disabled state and visible retryable transport failure',async()=>{
 const f=clientFixture(true,'synthetic error');const tree=flatten(f.Component({action:async()=>({message:null})}));assert.equal(tree.find(n=>n.type==='button').props.disabled,true);assert.equal(tree.find(n=>n.props?.role==='alert').props.children,'synthetic error');
 const retry=clientFixture();retry.Component({action:async()=>{throw Error('network failure')}});assert.ok((await retry.submit({message:null})).message);const redirect=clientFixture();redirect.Component({action:async()=>navigation.redirect('/print')});await assert.rejects(redirect.submit({message:null}),e=>e.redirect);
});
