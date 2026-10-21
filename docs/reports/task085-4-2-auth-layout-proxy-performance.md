# Task085.4.2 — Auth / Layout / Proxy Performance

Status: instrumentation baseline implementation; Before/After and acceptance pending. No optimization has been applied yet. Task085.4.3 is not started.

## Measurement design

Preview-only instrumentation correlates Proxy, getClaims, server-client creation, App/Pet layouts, page loaders and authenticated validation reads using a random internal request identifier. Incoming diagnostic headers are overwritten in Proxy; they are not authentication assertions. Actual auth verification, owner/pet checks, Supabase cookie refresh and RLS remain unchanged.

Logical getUser stage spans, fetch attempts, and physical undici request-create events are distinct signals. The latter is observed below Next fetch memoization and was tested with a local HTTP server: two adapter attempts with a deduplicating downstream produced one physical request event. Local JWT verification is not assumed merely because no physical Auth request is observed: getClaims, fetch attempts/JWKS events and runtime adapter coverage must be examined together. No ID, email, query filter, URL, credential, cookie, token or auth result body is logged. Route labels are a fixed category set. Diagnostics are disabled by default outside Preview (explicit local test opt-in exists).

Server Component traces use React cache only to reuse diagnostic metadata within a render pass. Next 16 local authentication documentation states that this cache does not memoize across requests and does not cache Server Action/Route Handler execution. No verified-user cache or optimization is in the baseline. The existing Task085.2 album context is unchanged.

A response-finished marker uses Next after() after request APIs have been resolved; it measures the server lifecycle through response completion, not browser paint. Nested stages are not added twice. Login instrumentation includes signInWithPassword, cookie-write completion/readonly state, redirect phase and Home entry without logging credentials. Different HTTP requests have different diagnostic identifiers; no persistent login-flow identifier or diagnostic cookie is introduced. An end-to-end login sample still needs an observed button click; no logout is performed automatically.

## Security / scope

Proxy still invokes getClaims. Existing App/Pet/page user checks and database validation remain authoritative; the baseline does not replace them with cookie trust. Only internal diagnostic request headers are forwarded. No service-role/client exposure, global user state, RLS bypass, cache across owners, ownership removal or membership reduction is introduced.

Home queries, Print loaders, image delivery, generation, Task081/Recovery/Safety, React rendering, Suspense/prefetch and save/revision/clientSeq contracts are outside scope and unchanged. Wrapper spans measure existing functions rather than changing their order or query shape.

## Verification and pending phases

Added tests for private-data-free diagnostic payloads, route classification, Proxy trace-header overwrite with cookie/response-header preservation and retained getClaims, physical vs adapter request counts, and disabled instrumentation behavior. Existing page execution fixtures explicitly pass through the new timing wrapper.

Full tests / TypeScript / lint / build and the Git Integration instrumentation Preview will be recorded after completion. Browser Before matrix must cover Home, Pet, Complete, Preview, /edit, Page Editor, Cover and Print on the same real fixture/session/viewport. No repeated logout is permitted. Security acceptance and optimization decision remain pending evidence.

Instrumentation baseline verification: 1189/1189 tests PASS; TypeScript PASS; lint 0 errors / 12 existing warnings; build PASS; git diff --check PASS. Preview Before measurement pending.
