import type { FiniteAdmission } from './finite-source-admission.ts';
/** Diagnostic projection only. Opaque inputs never leave this function. It grants no admission. */
export function admissionDiagnostics(m:FiniteAdmission, sessionTag:string, sourceSetTag:string, binding:string, now:number) {
  const offset=Math.floor(now/300000)-m.startWindow;
  const epochMatch=offset===0||offset===1;
  const credentialGroups=m.groups.filter(g=>g.sessionTag===sessionTag);
  const sourceGroups=credentialGroups.filter(g=>g.sourceSetTag===sourceSetTag);
  const credentialMatch=credentialGroups.length>0,sourceSetMatch=sourceGroups.length>0;
  const exactBindingMatch=epochMatch&&sourceGroups.some(g=>g.bindings[offset]===binding);
  // sessionTag is credential-derived: a mismatch cannot distinguish another session from refresh.
  const reason=!epochMatch?'epoch-expired':!credentialMatch?'credential-mismatch':!sourceSetMatch?'source-set-mismatch':!exactBindingMatch?'unknown':'match';
  return {reason,epochMatch,credentialMatch,sourceSetMatch,exactBindingMatch} as const;
}
