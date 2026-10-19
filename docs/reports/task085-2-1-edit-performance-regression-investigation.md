# Task085.2.1 — /edit Performance Regression Investigation

Status: IN PROGRESS. Task085.2 remains HOLD. No optimization or Task085.3 implementation.

## Scope and measurement contract

Only request-level instrumentation is added. Retrieval order, authorization, ownership, Multi-Pet eligibility, rendering, image delivery, and persistence remain unchanged. Production is not modified.

The edit loader records client creation, auth.getUser, album read, pet read, readDraft total, cover total, optional cover fallback URL resolution, response preparation, and total loader wall time using performance.now(). Existing draft.version/spreads/elements/preview-urls measurements are collected within the same request using AsyncLocalStorage. Cover row and missing URL resolution are measured separately.

A request-specific Supabase fetch observer counts actual HTTP attempts by an allowlisted table name. It forwards the original input and options without modification. Auth and Storage calls are separate from SELECTs. It does not log identifiers, URLs, paths, headers, credentials, or query values. Request correlation relies on the hosting platform request envelope; no application correlation identifier is emitted.

Measurements overlap: draft total includes its stages and transports; elements includes five parallel SELECTs. Do not sum nested durations. Response preparation measures construction of component props/React element only, not RSC serialization, browser paint, hydration, or image decode. Total loader excludes parent layouts, proxy, network transfer, and client work. Transport outcome denotes thrown errors, not application success inferred from HTTP status.

## Prior observation

Task085.2 measured link navigation /edit means of 4,615 ms Production and 5,361 ms Preview: +746 ms (16.2%). Three samples were taken per environment sequentially rather than interleaved. Existing draft-stage means were 2,011 ms and 2,400 ms, respectively. This does not establish causation.

Expected normal edit path: album, pet, active version, spreads, five element tables, photo paths, cover = 11 SELECTs. Missing cover paths or fallback cover paths can add SELECTs. Runtime counts are not yet measured for this instrumented build.

## Controlled comparison plan

Use the same existing real album, viewport, browser session, and runtime region. Alternate Production / Preview at least five pairs for each of Page Editor Back, Preview-to-edit link, and document load. Keep raw evidence local-only under ignored outputs. Record cache/prefetch hits separately from server requests, and fetch logs promptly within retention. Do not claim an absent server request has zero query latency.

## Results

Pending instrumented Preview deployment and controlled browser comparison. No causal conclusion or PASS re-evaluation yet. No speculative fix is applied.

## Verification

Pending final local check results.
