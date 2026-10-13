import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
import { applyCoverPhoto, mergeServerCover, toCoverEditor } from '../lib/album-persistence/cover.ts';
const require = createRequire(import.meta.url), ts = require('typescript'), React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = process.cwd(), resolve = Module._resolveFilename;
Module._resolveFilename = function(specifier, parent, ...rest) { if (specifier.startsWith('@/')) specifier = path.join(root, specifier.slice(2)); return resolve.call(this, specifier, parent, ...rest); };
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
const ids = { cover: '11111111-1111-4111-8111-111111111111', version: '22222222-2222-4222-8222-222222222222', album: '33333333-3333-4333-8333-333333333333', pet: '44444444-4444-4444-8444-444444444444', a: '55555555-5555-4555-8555-555555555555', b: '66666666-6666-4666-8666-666666666666' };
const urls = { [ids.a]: 'https://example.com/a.jpg', [ids.b]: 'https://example.com/b.jpg' };
function model(patch = {}) { return toCoverEditor({ id: ids.cover, draftVersionId: ids.version, coverType: 'front', aiPhotoId: ids.a, userPhotoId: null, aiTitle: 'Title', userTitle: null, aiSubtitle: 'Subtitle', userSubtitle: null, aiTemplateId: 'simple', userTemplateId: null, aiColorId: 'white', userColorId: null, revision: 1, clientSeq: 0, ...patch }, urls); }
function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }
let harness, store;
const load = Module._load;
const mockedReact = {
  useRef: (value) => harness.slot(() => ({ current: value })),
  useState: (initial) => { const index = harness.cursor++; if (!(index in harness.states)) harness.states[index] = typeof initial === 'function' ? initial() : initial; return [harness.states[index], (value) => { harness.states[index] = typeof value === 'function' ? value(harness.states[index]) : value; }]; },
  useEffect: (effect, deps) => { const index = harness.cursor++; const prev = harness.states[index]; if (!prev || deps.some((d, i) => d !== prev[i])) { harness.states[index] = deps; harness.effects.push(effect); } },
};
Module._load = function(specifier, parent, ...rest) {
  const name = parent?.filename ?? '';
  if (name.endsWith('/use-cover-edit-draft.ts') || name.endsWith('/cover-edit-screen.tsx')) {
    if (specifier === 'react') return mockedReact;
    if (specifier === 'next/navigation') return { useRouter: () => ({ push: (url) => harness.routes.push(url) }) };
    if (specifier.includes('album-draft-service')) return harness.service;
    if (specifier.includes('use-editor-history')) return { useEditorHistory: () => ({ push() {}, note() {}, undo() {}, redo() {}, beginGesture() {}, endGesture() {}, canUndo: false, canRedo: false }) };
  }
  if (name.endsWith('/[albumId]/edit/page.tsx')) {
    if (specifier.includes('supabase/server')) return { createClient: async () => store.client };
    if (specifier.includes('album-persistence/read-draft')) return { readDraft: async () => ({ versionId: ids.version, spreads: [], previewUrls: urls }), signedPreviewUrls: async () => new Map(Object.entries(urls)) };
  }
  if (name.endsWith('/album-draft-service.ts')) {
    if (specifier === 'next/cache') return { revalidatePath: (p) => store.routes.push(p) };
    if (specifier.includes('supabase/server')) return { createClient: async () => store.client };
    if (specifier.includes('album-persistence/read-draft')) return { messageFromError: (e) => e.message, signedPreviewUrls: async () => new Map(Object.entries(urls)), fail: (message) => ({ ok: false, message }), readDraft: async () => null };
    if (specifier.includes('album-analytics-server')) return { recordAlbumAnalyticsEvent: async () => {} };
  }
  return load.call(this, specifier, parent, ...rest);
};
const coverDir = root + '/app/(app)/pets/[petId]/album/[albumId]/cover/edit/';
function hookFixture(service, screen = false) {
  harness = { states: [], cursor: 0, effects: [], service, routes: [], slot(create) { const i = this.cursor++; if (!(i in this.states)) this.states[i] = create(); return this.states[i]; } };
  delete require.cache[coverDir + 'use-cover-edit-draft.ts']; delete require.cache[coverDir + 'cover-edit-screen.tsx'];
  const invoke = screen ? require(coverDir + 'cover-edit-screen.tsx').CoverEditScreen : require(coverDir + 'use-cover-edit-draft.ts').useCoverEditDraft;
  const oldWindow = globalThis.window; globalThis.window = { addEventListener() {}, removeEventListener() {} };
  return { render() { harness.cursor = 0; const result = screen ? invoke({ petName: 'Pet', dateLabel: '', cover: model(), seed: {}, albumId: ids.album, candidates: [{ id: ids.b, src: urls[ids.b], thumb: urls[ids.b] }], readonly: false, missing: false, backHref: '/edit', doneHref: '/edit', generateHref: '/new' }) : invoke(model(), ids.album, {}, false); for (const effect of harness.effects.splice(0)) effect(); return result; }, restore() { globalThis.window = oldWindow; } };
}
function nodes(element) { return Array.isArray(element) ? element.flatMap(nodes) : React.isValidElement(element) ? [element, ...nodes(element.props.children)] : []; }
function button(tree, id) { return nodes(tree).find((e) => e.props['data-testid'] === id); }
const tick = () => new Promise((r) => setImmediate(r));
function database() {
  store = { row: { id: ids.cover, draft_version_id: ids.version, ai_photo_id: ids.a, user_photo_id: null, ai_title: 'Title', ai_subtitle: 'Subtitle', ai_template_id: 'simple', ai_color_id: 'white', revision: 1, client_seq: 0 }, active: ids.version, routes: [], calls: [], rpcCalls: 0 };
  store.client = { auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) }, from(table) {
    const filters = new Map();
    const query = { select() { return this; }, eq(k, v) { filters.set(k, v); return this; }, async maybeSingle() {
      store.calls.push({ table, filters: Object.fromEntries(filters) });
      let data = table === 'albums' ? { id: ids.album, pet_id: ids.pet, owner_user_id: 'owner', status: 'draft', title: 'Album', period_from: '2026-01-01', period_to: '2026-02-01', cover_photo_id: ids.a } : table === 'pets' ? { id: ids.pet, name: 'Pet', owner_user_id: 'owner' } : table === 'photos' ? { id: filters.get('id'), pet_id: ids.pet, uploader_user_id: 'owner' } : table === 'album_draft_covers' ? structuredClone(store.row) : table === 'album_draft_versions' ? { id: ids.version, album_id: ids.album } : null;
      if (table === 'album_draft_versions' && filters.get('is_active') === true && store.active !== ids.version) data = null;
      if (table === 'album_draft_covers' && filters.has('draft_version_id') && filters.get('draft_version_id') !== store.row.draft_version_id) data = null;
      return { data, error: null };
    } }; return query;
  }, async rpc(name, args) {
    assert.equal(name, 'apply_draft_cover_override'); store.rpcCalls++;
    if (store.rpcError) return { data: null, error: { message: 'RPC rejected' } };
    const status = store.status ?? (args.p_expected_revision === store.row.revision ? 'applied' : 'conflict');
    if (status === 'applied') {
      if (args.p_field === 'photo') store.row.user_photo_id = args.p_reset ? null : args.p_photo_id;
      else store.row[`user_${args.p_field === 'template' ? 'template_id' : args.p_field === 'color' ? 'color_id' : args.p_field}`] = args.p_reset ? null : args.p_text;
      store.row.client_seq = args.p_client_seq; store.row.revision++;
    }
    if (store.switchDuringRPC) store.active = 'other';
    return { data: { status }, error: null };
  } };
  return store;
}
const { overrideCover, loadCoverEditor } = require(root + '/app/(app)/album-draft-service.ts');

test('cover photo optimistic update immediately changes the local preview', async () => {
  const waiting = deferred();
  const h = hookFixture({ overrideCover: async () => waiting.promise });
  try { const draft = h.render(); draft.setPhoto(ids.b, urls[ids.b]); assert.equal(h.render().cover.previewUrl, urls[ids.b]); assert.equal(h.render().saveState, 'saving'); waiting.resolve({ ok: true, writeStatus: 'applied', cover: model({ userPhotoId: ids.b, clientSeq: 1, revision: 2 }) }); assert.equal(await draft.flushPending(), true); } finally { h.restore(); }
});

test('real cover mutation persists, reloads the active row, and revalidates detail/Preview/edit/print', async () => {
  database(); const result = await overrideCover(ids.cover, 1, 1, 'photo', ids.b);
  assert.equal(result.ok, true); assert.equal(store.row.user_photo_id, ids.b); assert.equal(result.cover.previewUrl, urls[ids.b]);
  const base = `/pets/${ids.pet}/album/${ids.album}`;
  assert.deepEqual(store.routes, [base, base + '/edit', base + '/print']);
  const reload = await loadCoverEditor(ids.album, {});
  assert.equal(reload.cover.photoId, ids.b); assert.equal(reload.cover.draftVersionId, ids.version);
  const { AlbumPreviewScreen } = require(root + '/app/(app)/pets/[petId]/album/[albumId]/album-preview-screen.tsx');
  const html = renderToStaticMarkup(React.createElement(AlbumPreviewScreen, { spreads: [], draft: { spreads: [] }, cover: reload.cover, backHref: '/', editHref: '/', orderHref: '/', printHref: '/' }));
  assert.ok(html.includes(urls[ids.b]));
});

test('inactive version is rejected before save and a version switch during RPC is not adopted', async () => {
  database(); store.active = 'other'; let result = await overrideCover(ids.cover, 1, 1, 'photo', ids.b); assert.equal(result.ok, false); assert.equal(store.rpcCalls, 0);
  database(); store.switchDuringRPC = true; result = await overrideCover(ids.cover, 1, 1, 'photo', ids.b); assert.equal(result.ok, false); assert.equal(result.cover, null); assert.deepEqual(store.routes, []);
});

test('conflict/RPC failure never revalidate routes as a successful mutation', async () => {
  for (const kind of ['conflict', 'rpcError']) { database(); if (kind === 'conflict') store.status = kind; else store.rpcError = true; const result = await overrideCover(ids.cover, 1, 1, 'photo', ids.b); assert.equal(result.ok, false); assert.deepEqual(store.routes, []); }
});

test('slow A response cannot roll back optimistic B, and queued B uses refreshed revision', async () => {
  const waiting = deferred(), revisions = []; let calls = 0;
  const h = hookFixture({ overrideCover: async (_id, revision, seq, _field, value) => { revisions.push(revision); calls++; return calls === 1 ? waiting.promise : { ok: true, writeStatus: 'applied', cover: model({ userPhotoId: value, clientSeq: seq, revision: 3 }) }; } });
  try { const draft = h.render(); draft.setPhoto(ids.a, urls[ids.a]); await tick(); draft.setPhoto(ids.b, urls[ids.b]); waiting.resolve({ ok: true, writeStatus: 'applied', cover: model({ userPhotoId: ids.a, clientSeq: 1, revision: 2 }) }); assert.equal(h.render().cover.photoId, ids.b); assert.equal(await draft.flushPending(), true); assert.equal(h.render().cover.photoId, ids.b); assert.deepEqual(revisions, [1, 2]); } finally { h.restore(); }
  const b = applyCoverPhoto(model(), ids.b, 2, urls[ids.b]); const a = model({ userPhotoId: ids.a, clientSeq: 1, revision: 2 }); assert.equal(mergeServerCover(b, a, 1), b);
  assert.equal(mergeServerCover(b, model({ draftVersionId: 'different', userPhotoId: ids.a, clientSeq: 9 }), 9), b);
});

test('save rejection/ok:false/conflict retain errors and local edit, block leave, and allow retry', async () => {
  for (const mode of ['reject', 'false', 'conflict']) {
    let fail = true;
    const h = hookFixture({ overrideCover: async (_id, _rev, seq) => { if (fail && mode === 'reject') throw new Error('network'); if (fail) return { ok: mode === 'conflict', writeStatus: mode === 'conflict' ? 'conflict' : null, message: 'failed', cover: model({ revision: 2 }) }; return { ok: true, writeStatus: 'applied', cover: model({ userPhotoId: ids.b, revision: 3, clientSeq: seq }) }; } });
    try { const draft = h.render(); draft.setPhoto(ids.b, urls[ids.b]); assert.equal(await draft.flushPending(), false); const error = h.render(); assert.equal(error.saveState, 'error'); assert.ok(error.error); assert.equal(error.cover.photoId, ids.b); fail = false; error.retry(); assert.equal(await error.flushPending(), true); assert.equal(h.render().saveState, 'saved'); } finally { h.restore(); }
  }
});

test('different debounced cover fields are flushed without discarding each other', async () => {
  const writes = [];
  const h = hookFixture({ overrideCover: async (_id, _revision, seq, field, value) => { writes.push({ field, value }); return { ok: true, writeStatus: 'applied', cover: model({ userTitle: 'new title', userSubtitle: 'new subtitle', clientSeq: seq, revision: seq + 1 }) }; } });
  try { const draft = h.render(); draft.setTitle('new title'); draft.setSubtitle('new subtitle'); assert.equal(await draft.flushPending(), true); assert.deepEqual(writes, [{ field: 'title', value: 'new title' }, { field: 'subtitle', value: 'new subtitle' }]); } finally { h.restore(); }
});

test('actual cover Done Link waits for queued save and navigates only on success', async () => {
  const waiting = deferred();
  const h = hookFixture({ overrideCover: async () => waiting.promise }, true);
  try { let tree = h.render(); button(tree, 'cover-edit-change-photo').props.onClick(); tree = h.render(); button(tree, `cover-edit-picker-item-${ids.b}`).props.onClick(); tree = h.render(); button(tree, 'cover-edit-done').props.onClick({ preventDefault() {} }); assert.deepEqual(harness.routes, []); waiting.resolve({ ok: true, writeStatus: 'applied', cover: model({ userPhotoId: ids.b, revision: 2, clientSeq: 1 }) }); await tick(); assert.deepEqual(harness.routes, ['/edit']); } finally { h.restore(); }
});

test('actual cover Back Link does not navigate on rejected save', async () => {
  const h = hookFixture({ overrideCover: async () => { throw new Error('network'); } }, true);
  try { let tree = h.render(); button(tree, 'cover-edit-change-photo').props.onClick(); tree = h.render(); button(tree, `cover-edit-picker-item-${ids.b}`).props.onClick(); tree = h.render(); button(tree, 'cover-edit-back').props.onClick({ preventDefault() {} }); await tick(); assert.deepEqual(harness.routes, []); tree = h.render(); assert.ok(button(tree, 'cover-edit-save-error')); assert.ok(button(tree, 'cover-edit-retry')); } finally { h.restore(); }
});


test('after cover save, /edit server page reads the same new cover without album photo fallback', async () => {
  database();
  assert.equal((await overrideCover(ids.cover, 1, 1, 'photo', ids.b)).ok, true);
  const Page = require(root + '/app/(app)/pets/[petId]/album/[albumId]/edit/page.tsx').default;
  const tree = await Page({ params: Promise.resolve({ petId: ids.pet, albumId: ids.album }) });
  assert.equal(tree.props.coverSrc, urls[ids.b]);
  assert.equal(tree.props.cover.draftVersionId, ids.version);
  const html = renderToStaticMarkup(tree);
  assert.ok(html.includes(urls[ids.b]));
  assert.ok(!html.includes(`src="${urls[ids.a]}"`));
});
