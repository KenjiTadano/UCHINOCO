import { createHash, createPublicKey, verify } from "node:crypto";
import { admissionDigest, admissionScope, parseFiniteAdmission, type AdmissionGroup, type AdmissionRuntime } from "./finite-source-admission.ts";
import { proposeSourceAdmission, type SourceLease } from "./signed-source-lease.ts";
export type HandoffIntent = { version: 1; environment: "preview" | "production"; build: string; region: "sin1"; trial: string; startWindow: number; nonce: string; proposalPublicKey: string; sealPublicKey: string; slots: { albumId: string; petId: string }[] };
export type HandoffProposal = { version: 1; environment: string; build: string; region: string; trial: string; startWindow: number; nonce: string; slot: number; group: AdmissionGroup };
export type HandoffAudit = { outcome: string; count: number; bindingCount: number; environment: string; region: string; buildMatch: boolean; epochMatch: boolean };
export const intentDigest = (m: HandoffIntent) => createHash("sha256").update(JSON.stringify(m)).digest("hex");
export function parseHandoffIntent(raw: string | undefined, pin: string | undefined, runtime: AdmissionRuntime): HandoffIntent | null {
  if (!raw || raw.length > 4096 || !/^[a-f0-9]{64}$/.test(pin ?? "") || !["preview","production"].includes(runtime.environment ?? "") || runtime.region !== "sin1") return null;
  try {
    const v = JSON.parse(raw);
    if (v.version !== 1 || v.environment !== runtime.environment || v.build !== runtime.build || !/^[a-f0-9]{40}$/.test(v.build) || v.region !== runtime.region || !/^[a-z0-9-]{1,48}$/.test(v.trial) || !/^[a-f0-9]{64}$/.test(v.nonce) || !Number.isSafeInteger(v.startWindow) || v.startWindow <= 0 || !Array.isArray(v.slots) || v.slots.length < 1 || v.slots.length > 2) return null;
    for(const key of [v.proposalPublicKey,v.sealPublicKey]){if(typeof key!=="string"||key.length>1000||!key.startsWith("-----BEGIN PUBLIC KEY-----")||createPublicKey(key).asymmetricKeyType!=="ed25519")return null;}
    const slots = v.slots.map((s: {albumId: string;petId: string}) => {
      if (!s || !/^[a-f0-9-]{36}$/.test(s.albumId) || !/^[a-f0-9-]{36}$/.test(s.petId)) throw new Error("Invalid scope");
      return Object.freeze({ albumId:s.albumId,petId:s.petId });
    });
    const m = Object.freeze({version:1 as const,environment:v.environment,build:v.build,region:v.region,trial:v.trial,startWindow:v.startWindow,nonce:v.nonce,proposalPublicKey:v.proposalPublicKey,sealPublicKey:v.sealPublicKey,slots:Object.freeze(slots)}) as unknown as HandoffIntent;
    return intentDigest(m) === pin ? m : null;
  } catch { return null; }
}
export function handoffEpochMatches(m: HandoffIntent, now = Date.now()) {
  return Math.floor(now / 300000) === m.startWindow && (m.startWindow + 2) * 300000 - now >= 480000;
}
type Context = Omit<SourceLease,"scope" | "admission">;
type Dependencies = {
  control: () => Promise<unknown>;
  authenticate: () => Promise<Context | null>;
  authorize: (context: Context, albumId: string, petId: string, ids: string[]) => Promise<boolean>;
  sign: (context: Context, ids: string[]) => Promise<Map<string,string>>;
  unchangedSession: (context: Context) => Promise<boolean>;
  publish: (slot: number, proposal: HandoffProposal) => Promise<"created" | "exists">;
  audit: (value: HandoffAudit) => void;
};
export async function executePrivateHandoff(m: HandoffIntent, project: string, albumId: string, petId: string, fresh: Map<string,string>, deps: Dependencies, now = () => Date.now()) {
  const finish = (outcome: string, count = 0) => {
    const audit = {outcome,count,bindingCount:count * 2,environment:m.environment,region:m.region,buildMatch:true,epochMatch:handoffEpochMatches(m,now())};
    try { deps.audit(audit); } catch {} return audit;
  };
  if (!handoffEpochMatches(m,now())) return finish("insufficient-epoch-time");
  try {
    const c = await deps.control() as Record<string,unknown> | null;
    if (!c || c.version !== 1 || c.phase !== "handoff" || c.enabled !== false || c.armed !== true || c.intentDigest !== intentDigest(m) || c.validUntil !== (m.startWindow+2)*300000 || !Number.isInteger(c.slot) || Number(c.slot) < 0 || Number(c.slot) >= m.slots.length) return finish("disabled");
    const slot = Number(c.slot), selected = m.slots[slot];
    if (selected.albumId !== albumId || selected.petId !== petId) return finish("scope-denied");
    const context = await deps.authenticate();
    if (!context || !context.verifiedUserId || context.sessionUserId !== context.verifiedUserId || !context.accessToken || !Number.isFinite(context.sessionExpiresAt) || context.sessionExpiresAt <= now()+30000) return finish("auth-denied");
    const ids = [...fresh.keys()];
    if (!ids.length || ids.length > 100 || !await deps.authorize(context,albumId,petId,ids)) return finish("source-denied");
    const signed = await deps.sign(context,ids);
    if (signed.size !== fresh.size || ids.some(id=>!signed.has(id))) return finish("source-denied");
    if (!await deps.unchangedSession(context) || !handoffEpochMatches(m,now())) return finish("session-or-epoch-changed");
    const lease = {...context,scope:admissionScope(project,m,albumId)};
    const group = proposeSourceAdmission(signed,lease,m.startWindow,now()), expected = proposeSourceAdmission(fresh,lease,m.startWindow,now());
    if (!group || !expected || group.sourceSetTag !== expected.sourceSetTag) return finish("source-changed");
    const proposal: HandoffProposal = {version:1,environment:m.environment,build:m.build,region:m.region,trial:m.trial,startWindow:m.startWindow,nonce:m.nonce,slot,group};
    const published = await deps.publish(slot,proposal);
    return finish(published === "created" ? "proposal-created" : "duplicate-proposal",published === "created" ? 1 : 0);
  } catch { return finish("handoff-failed"); }
}
/** Private operator process only; never a browser DTO. All slots or no manifest. */
export function sealPrivateHandoff(m: HandoffIntent, proposals: HandoffProposal[], runtime: AdmissionRuntime, now = Date.now()) {
  if (!handoffEpochMatches(m,now) || proposals.length !== m.slots.length) return null;
  const sorted = [...proposals].sort((a,b)=>a.slot-b.slot);
  if (sorted.some((p,i)=>p.version!==1 || p.slot!==i || p.environment!==m.environment || p.build!==m.build || p.region!==m.region || p.trial!==m.trial || p.startWindow!==m.startWindow || p.nonce!==m.nonce)) return null;
  const manifest = parseFiniteAdmission(JSON.stringify({version:1,environment:m.environment,build:m.build,region:m.region,trial:m.trial,startWindow:m.startWindow,groups:sorted.map(p=>p.group)}),runtime);
  return manifest ? {manifest,digest:admissionDigest(manifest)} : null;
}

/** Pinned intent + operator signature replace no security checks; digest/epochs stay exact. */
export function verifySealedHandoff(m: HandoffIntent, value: unknown, runtime: AdmissionRuntime, now = Date.now()) {
  try {
    const c=value as Record<string,unknown>;
    if(!c||c.version!==1||c.phase!=="trial"||typeof c.enabled!=="boolean"||c.intentDigest!==intentDigest(m)||c.validUntil!==(m.startWindow+2)*300000||typeof c.signature!=="string")return null;
    const manifest=parseFiniteAdmission(JSON.stringify(c.manifest),runtime);
    if(!manifest||manifest.trial!==m.trial||manifest.startWindow!==m.startWindow||manifest.groups.length!==m.slots.length||manifest.environment!==m.environment||manifest.build!==m.build||manifest.region!==m.region||now>=(m.startWindow+2)*300000||Math.floor(now/300000)<m.startWindow)return null;
    const digest=admissionDigest(manifest);
    if(c.manifestDigest!==digest)return null;
    const certificates=c.certificates as {proposal:HandoffProposal;signature:string}[];
    if(!Array.isArray(certificates)||certificates.length!==m.slots.length)return null;
    for(let i=0;i<certificates.length;i++){
      const x=certificates[i];
      if(!x||typeof x.signature!=="string"||!verify(null,Buffer.from(JSON.stringify(x.proposal)),createPublicKey(m.proposalPublicKey),Buffer.from(x.signature,"base64url")))return null;
      const p=x.proposal;
      if(p.version!==1||p.slot!==i||p.nonce!==m.nonce||p.environment!==m.environment||p.build!==m.build||p.region!==m.region||p.trial!==m.trial||p.startWindow!==m.startWindow||JSON.stringify(p.group)!==JSON.stringify(manifest.groups[i]))return null;
    }
    const message=JSON.stringify({intentDigest:intentDigest(m),manifest,digest,certificates});
    return verify(null,Buffer.from(message),createPublicKey(m.sealPublicKey),Buffer.from(c.signature,"base64url"))?{manifest,digest}:null;
  } catch {return null}
}
