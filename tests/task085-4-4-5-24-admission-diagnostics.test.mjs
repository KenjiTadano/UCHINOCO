import {test} from 'node:test';import assert from 'node:assert/strict';
import {admissionDiagnostics} from '../lib/album-persistence/admission-diagnostics.ts';
import {admissionAllows} from '../lib/album-persistence/finite-source-admission.ts';
const m={startWindow:10,groups:[{sessionTag:'synthetic-credential',sourceSetTag:'synthetic-set',bindings:['synthetic-first','synthetic-next']}]};
test('projection matches the existing predicate without broadening admission',()=>{
 for(const [session,source,binding,now,reason]of [
 ['synthetic-credential','synthetic-set','synthetic-first',3000000,'match'],
 ['synthetic-credential','synthetic-set','synthetic-next',3300000,'match'],
 ['different-credential','synthetic-set','synthetic-first',3000000,'credential-mismatch'],
 ['synthetic-credential','different-set','synthetic-first',3000000,'source-set-mismatch'],
 ['synthetic-credential','synthetic-set','different-binding',3000000,'unknown'],
 ['synthetic-credential','synthetic-set','synthetic-first',3600000,'epoch-expired']]){
 const value=admissionDiagnostics(m,session,source,binding,now);assert.equal(value.reason,reason);assert.equal(value.reason==='match',admissionAllows(m,session,source,binding,now));
 assert.equal(/synthetic|different/.test(JSON.stringify(value)),false);assert.ok(Object.values(value).every(v=>typeof v==='boolean'||v===reason));
 }
});
test('opaque source-set mismatch does not invent bucket/variant/session attribution',()=>{
 const d=admissionDiagnostics(m,'synthetic-credential','different-set','synthetic-first',3000000);assert.equal(d.reason,'source-set-mismatch');assert.equal('bucketMatch'in d,false);assert.equal('sessionMatch'in d,false);
});
