/** Transport only. Caller must freshly authorize and strictly validate the exact private grants. */
export type PublicationOutcome = "created" | "exists" | "committed-ack-unknown" | "ack-unknown" | "failed";
export type PublicationDiagnostic = {
  stage: "grant-validated" | "preflight-head" | "put-started" | "put-returned" | "put-response-parsed" | "head-confirmed" | "audit-emitted";
  success: boolean;
  elapsedMs: number;
  statusCategory: "none" | "2xx" | "4xx" | "5xx" | "other";
  responseShape: "not-observed" | "body-not-required" | "cleanup-failed" | "invalid-response" | "timeout" | "fetch-error";
  committedObjectObserved: boolean;
};
type Options = {
  fetch?: typeof fetch;
  audit?: (value: PublicationDiagnostic) => void;
  budgetMs?: number;
  putTimeoutMs?: number;
  headTimeoutMs?: number;
};
const TOTAL_MS = 2500, PUT_MS = 1500, HEAD_MS = 350;
type Attempt = { response?: Response; shape: PublicationDiagnostic["responseShape"] };

/** Exactly one PUT at most. HEAD existence is evidence, never authorization or content validation. */
export async function publishPrivateProposal(
  input: { head: string; put: string; value: string; validUntil: number },
  options: Options = {},
): Promise<PublicationOutcome> {
  const began = performance.now();
  const deadline = began + Math.min(TOTAL_MS, options.budgetMs ?? TOTAL_MS);
  const remaining = () => Math.max(0, Math.min(deadline - performance.now(), input.validUntil - Date.now()));
  let observed = false;
  const category = (r?: Response): PublicationDiagnostic["statusCategory"] => !r ? "none" : r.status >= 200 && r.status < 300 ? "2xx" : r.status >= 400 && r.status < 500 ? "4xx" : r.status >= 500 && r.status < 600 ? "5xx" : "other";
  const emit = (stage: PublicationDiagnostic["stage"], success: boolean, attempt: Attempt = { shape: "not-observed" }) => {
    try { options.audit?.({stage,success,elapsedMs:Math.round(performance.now()-began),statusCategory:category(attempt.response),responseShape:attempt.shape,committedObjectObserved:observed}); } catch {}
  };
  const valid = Number.isFinite(input.validUntil) && input.validUntil > Date.now() && Buffer.byteLength(input.value) <= 8192;
  emit("grant-validated",valid);
  if (!valid) return "failed";

  async function request(url: string, method: "HEAD" | "PUT", maximum: number): Promise<Attempt> {
    const ms = Math.floor(Math.min(maximum,remaining()));
    if (ms <= 0) return {shape:"timeout"};
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined, timedOut = false;
    const operation = Promise.resolve().then(() => (options.fetch ?? fetch)(url,{
      method,cache:"no-store",redirect:"error",signal:controller.signal,
      ...(method === "PUT" ? {body:input.value,headers:{"Content-Type":"application/json"}} : {}),
    }));
    // Abort real fetches; safely dispose a late response from an adapter that ignores abort.
    void operation.then(r => {if(timedOut){try{void r.body?.cancel().catch(()=>{});}catch{}}},()=>{});
    try {
      const response = await Promise.race([operation,new Promise<never>((_,reject)=>{
        timer=setTimeout(()=>{timedOut=true;controller.abort();reject(new Error("Publication deadline"));},ms);
      })]);
      if (!response || !Number.isInteger(response.status) || response.status < 100 || response.status > 599 || typeof response.ok !== "boolean" || response.ok !== (response.status >= 200 && response.status < 300)) return {shape:"invalid-response"};
      return {response,shape:"body-not-required"};
    } catch {return {shape:controller.signal.aborted?"timeout":"fetch-error"};}
    finally {clearTimeout(timer);}
  }
  async function dispose(attempt: Attempt): Promise<Attempt> {
    if (!attempt.response?.body) return attempt;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([attempt.response.body.cancel(),new Promise<never>((_,reject)=>{
        timer=setTimeout(()=>reject(new Error("Body cleanup deadline")),Math.max(1,Math.min(50,remaining())));
      })]);
      return attempt;
    } catch {return {...attempt,shape:"cleanup-failed"};}
    finally {clearTimeout(timer);}
  }
  async function head(stage: "preflight-head" | "head-confirmed"): Promise<boolean | null> {
    const result=await request(input.head,"HEAD",Math.min(HEAD_MS,options.headTimeoutMs??HEAD_MS));
    const found=result.response?.ok===true;
    if(found)observed=true;
    emit(stage,found,result);
    if(found)return true;
    return result.response?.status===404?false:null;
  }
  const before=await head("preflight-head");
  if(before===true)return "exists";
  if(before===null)return "failed"; // No PUT was started.
  if(remaining()<=0)return "failed";

  emit("put-started",true);
  const returned=await request(input.put,"PUT",Math.min(PUT_MS,options.putTimeoutMs??PUT_MS));
  emit("put-returned",returned.response?.ok===true,returned);
  const handled=await dispose(returned);
  // No JSON/body schema is needed for acknowledgement: only HTTP status + private HEAD.
  emit("put-response-parsed",handled.shape==="body-not-required",handled);
  let confirmed=await head("head-confirmed");
  if(confirmed!==true&&remaining()>25){
    await new Promise(resolve=>setTimeout(resolve,25));
    confirmed=await head("head-confirmed");
  }
  if(confirmed===true)return returned.response?.ok?"created":"committed-ack-unknown";
  if(returned.response?.ok)return "ack-unknown";
  // A rejected request plus observed absence is a publication failure. Timeouts/5xx
  // plus absence remain UNKNOWN: eventual visibility cannot prove non-commit.
  if(confirmed===false&&[400,401,403,404,413,422].includes(returned.response?.status??0))return "failed";
  return "ack-unknown";
}
