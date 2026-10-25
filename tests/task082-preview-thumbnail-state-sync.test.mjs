import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
import { assembleEditorSpread, applyFrameCrop, applyFramePhoto, applySpreadLayout, draftSpreadRenderProps, mergeServerDraft } from '../lib/album-persistence/editor.ts';
import { findDraftLayout } from '../lib/album-persistence/preview.ts';

// Execute the real TSX renderer in SSR, without adding runtime/test dependencies.
const require = createRequire(import.meta.url);
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = process.cwd();
const resolve = Module._resolveFilename;
Module._resolveFilename = function(specifier, parent, ...rest) {
  if (specifier.startsWith('@/')) specifier = path.join(root, specifier.slice(2));
  return resolve.call(this, specifier, parent, ...rest);
};
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => {
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  module._compile(code, filename);
};
const base = root + '/app/(app)/pets/[petId]/album/';
const { DraftSpreadView } = require(base + '_components/draft-spread-view.tsx');
const { DraftSpreadThumbnail } = require(base + '_components/draft-spread-thumbnail.tsx');
const { AlbumPreviewScreen } = require(base + '[albumId]/album-preview-screen.tsx');

function fixture(layoutId = 'E_2_EQUAL') {
  const layout = findDraftLayout(layoutId);
  const source = { id: 'spread-1', draftVersionId: 'version-1', storySpreadId: 'editorial-1', position: 0, storyType: 'everyday', recommendedDensity: 'medium', importance: 80, coherence: 90, aiLayoutId: layoutId, userLayoutId: null, warnings: [], revision: 1, clientSeq: 0 };
  const frames = layout.frames.map((slot, i) => ({ id: `frame-${i}`, draftSpreadId: source.id, frameId: slot.id, role: i === 0 ? 'primary' : 'secondary', position: i, aiPhotoId: `photo-${i}`, userPhotoId: null, aiCropX: 0.5, aiCropY: 0.5, aiCropScale: 1, userCropX: null, userCropY: null, userCropScale: null, warnings: [], matchTier: 'STRICT', cropQuality: 90, revision: 1, clientSeq: 0 }));
  const previewUrls = { 'photo-0': 'https://example.com/0.jpg', 'photo-1': 'https://example.com/1.jpg' };
  return { albumId: 'album-1', versionId: 'version-1', status: 'draft', revision: 1, signature: 'fixture', previewUrls, spreads: [assembleEditorSpread(source, frames, new Map(Object.entries(previewUrls)))] };
}
function render(view) {
  const spread = view.spreads[0];
  return { main: renderToStaticMarkup(React.createElement(DraftSpreadView, draftSpreadRenderProps(spread, view.previewUrls))), thumb: renderToStaticMarkup(React.createElement(DraftSpreadThumbnail, { spread, previewUrls: view.previewUrls })) };
}
function visualFrames(html) {
  return [...html.matchAll(/data-photo-id="([^"]+)"[^>]*data-crop="([^"]+)"[^>]*data-image-fit="([^"]+)"[^>]*data-geometry="([^"]+)"/g)].map((m) => m.slice(1));
}

test('crop updates both real main and thumbnail renderers immediately', () => {
  const before = render(fixture());
  const after = render(applyFrameCrop(fixture(), 'frame-0', { x: .2, y: .7, scale: 1.6 }, 1));
  assert.notDeepEqual(visualFrames(before.main), visualFrames(after.main));
  assert.deepEqual(visualFrames(after.main), visualFrames(after.thumb));
  for (const html of [after.main, after.thumb]) assert.ok(html.includes('scale(1.6)') && html.includes('object-position:20% 70%'));
});

test('layout change updates geometry and effective slot IDs in both surfaces', () => {
  const view = applySpreadLayout(fixture(), 'spread-1', 'E_2_LEFT_HERO', 1);
  const after = render(view);
  assert.notDeepEqual(visualFrames(render(fixture()).main), visualFrames(after.main));
  assert.deepEqual(visualFrames(after.main), visualFrames(after.thumb));
  const props = draftSpreadRenderProps(view.spreads[0], view.previewUrls);
  assert.equal(props.frames[0].frameId, props.preview.assignments[0].frameId);
  assert.ok(after.thumb.includes('data-layout="E_2_LEFT_HERO"'));
});

test('photo replacement changes the thumbnail source immediately', () => {
  const result = render(applyFramePhoto(fixture(), 'frame-0', 'replacement', 1, 'https://example.com/new.jpg'));
  for (const html of [result.main, result.thumb]) assert.ok(html.includes('https://example.com/new.jpg'));
  assert.deepEqual(visualFrames(result.main), visualFrames(result.thumb));
});

test('contain and cover, background and page elements use identical renderer state', () => {
  const contained = fixture('E_FINAL_NO_CROP_PORTRAIT_LEFT');
  contained.spreads[0].backgrounds.left.backgroundId = 'warm';
  contained.spreads[0].elements = [{ id: 'text-1', type: 'text', pageSide: 'left', x: .1, y: .1, width: .2, height: .1, rotation: 0, zIndex: 1, text: '同期テスト', fontSize: 16, colorId: 'ink', revision: 1, clientSeq: 1 }];
  const result = render(contained);
  for (const html of [result.main, result.thumb]) assert.ok(html.includes('object-fit:contain') && html.includes('transform:none') && html.includes('同期テスト') && html.includes('background-color:#fbf8f3'));
  assert.deepEqual(visualFrames(result.main), visualFrames(result.thumb));
  const covered = render(applySpreadLayout(contained, 'spread-1', 'E_1_LEFT_PORTRAIT', 1));
  for (const html of [covered.main, covered.thumb]) assert.ok(html.includes('object-fit:cover'));
});

test('reload projection of persisted override rows preserves edited visual output', () => {
  let edited = applySpreadLayout(fixture(), 'spread-1', 'E_2_LEFT_HERO', 1);
  edited = applyFrameCrop(edited, 'frame-0', { x: .2, y: .7, scale: 1.6 }, 1);
  edited = applyFramePhoto(edited, 'frame-1', 'replacement', 1, 'https://example.com/new.jpg');
  const persisted = JSON.parse(JSON.stringify(edited));
  const s = persisted.spreads[0];
  persisted.spreads = [assembleEditorSpread(s.source, s.sourceFrames, new Map(Object.entries(persisted.previewUrls)), s.texts, s.decorations, s.elements, s.backgrounds)];
  assert.deepEqual(visualFrames(render(edited).main), visualFrames(render(persisted).thumb));
});

test('an acknowledgement for one target cannot erase another pending edit', () => {
  const local = applyFramePhoto(applyFrameCrop(fixture(), 'frame-0', { x: .2, y: .7, scale: 1.6 }, 2), 'frame-1', 'replacement', 1, 'https://example.com/new.jpg');
  const server = applyFramePhoto(fixture(), 'frame-1', 'replacement', 1, 'https://example.com/new.jpg');
  server.spreads[0].sourceFrames[1].revision = 2;
  const merged = mergeServerDraft(local, server, 1, 'frame-1');
  assert.deepEqual(draftSpreadRenderProps(merged.spreads[0], merged.previewUrls).frames[0].crop, { x: .2, y: .7, scale: 1.6 });
  assert.equal(merged.spreads[0].sourceFrames[1].revision, 2);
  assert.deepEqual(visualFrames(render(merged).main), visualFrames(render(merged).thumb));
});

test('a pending element deletion stays deleted across unrelated server response', () => {
  const server = fixture();
  server.spreads[0].elements = [{ id: 'deleted', revision: 1, clientSeq: 1 }];
  const local = fixture();
  const merged = mergeServerDraft(local, server, 1, 'frame-0', new Map([['element:spread-1:deleted', 2]]));
  assert.equal(merged.spreads[0].elements.length, 0);
});

test('Preview selection and thumbnails are built from the same draft sequence', () => {
  const draft = fixture();
  draft.spreads.push({ ...fixture('E_2_LEFT_HERO').spreads[0], id: 'spread-2', storySpreadId: 'editorial-2' });
  const html = renderToStaticMarkup(React.createElement(AlbumPreviewScreen, { spreads: [], draft, backHref: '/', editHref: '/', orderHref: '/', printHref: '/' }));
  assert.ok(html.includes('aria-selected="true"'));
  assert.equal((html.match(/class="draft-spread-thumbnail"/g) ?? []).length, 2);
  assert.ok(html.includes('data-layout="E_2_EQUAL"'));
});

// Exercise the actual save hook with controlled service promises. React's hook
// storage is simulated; real DOM/route behavior remains Preview acceptance work.
let harness;
let serverHarness;
const load = Module._load;
Module._load = function(specifier, parent, ...rest) {
  if (parent?.filename.endsWith('/[albumId]/edit/page.tsx') && serverHarness) {
    if (specifier.includes('album-persistence/edit-source-canary')) return { applyEditSourceCanary: async (_client, _user, _album, fresh) => fresh, recordEditCanaryAuthDeny() {} };
    if (specifier.includes('supabase/server')) return { createClient: async () => serverHarness.client };
    if (specifier.includes('album-persistence/read-draft')) return { readDraft: async () => { serverHarness.loads++; return serverHarness.draft; }, signedPreviewUrls: async () => new Map() };
  }
  if (parent?.filename.endsWith('/use-page-edit-draft.ts') || parent?.filename.endsWith('/album-preview-screen.tsx')) {
    if (specifier === 'react') return {
      useRef: (initial) => harness.slot(() => ({ current: initial })),
      useState: (initial) => { const index = harness.cursor++; if (!(index in harness.slots)) harness.slots[index] = typeof initial === 'function' ? initial() : initial; return [harness.slots[index], (value) => { harness.slots[index] = typeof value === 'function' ? value(harness.slots[index]) : value; }]; },
      useEffect: (effect, deps) => { const index = harness.cursor++; const previous = harness.slots[index]; if (!previous || deps.some((d, i) => d !== previous[i])) { harness.slots[index] = deps; harness.effects.push(effect); } },
    };
    if (specifier.includes('album-draft-service')) return harness.service;
    if (specifier.includes('use-editor-history')) return { useEditorHistory: () => ({ push() {}, note() {}, beginGesture() {}, endGesture() {}, undo() {}, redo() {}, canUndo: false, canRedo: false }) };
  }
  return load.call(this, specifier, parent, ...rest);
};
const hookPath = path.join(base, '[albumId]/pages/edit/use-page-edit-draft.ts');
function hookFixture(service) {
  const initial = fixture();
  harness = { slots: [], cursor: 0, effects: [], service, slot(create) { const index = this.cursor++; if (!(index in this.slots)) this.slots[index] = create(); return this.slots[index]; } };
  delete require.cache[hookPath];
  const { usePageEditDraft } = require(hookPath);
  const previousWindow = globalThis.window;
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  const useHarnessDraft = () => { harness.cursor = 0; const result = usePageEditDraft(initial, 'album-1', false); for (const effect of harness.effects.splice(0)) effect(); return result; };
  return { renderHook: useHarnessDraft, restore() { globalThis.window = previousWindow; } };
}

test('rejected save stays an explicit error, blocks departure, and can be retried', async () => {
  let reject = true;
  const h = hookFixture({ overrideFramePhoto: async (_id, _revision, seq, photo) => {
    if (reject) throw new Error('network failure');
    return { ok: true, writeStatus: 'applied', message: null, view: applyFramePhoto(fixture(), 'frame-0', photo, seq, 'https://example.com/new.jpg') };
  } });
  try {
    let hook = h.renderHook();
    hook.setPhoto('frame-0', 'replacement', 'https://example.com/new.jpg');
    assert.equal(await hook.flushPending(), false);
    hook = h.renderHook();
    assert.equal(hook.saveState, 'error');
    assert.ok(hook.error);
    reject = false;
    hook.retry();
    assert.equal(await hook.flushPending(), true);
    hook = h.renderHook();
    assert.equal(hook.saveState, 'saved');
  } finally { h.restore(); }
});

test('departure flushes a debounced crop before navigation', async () => {
  const writes = [];
  const h = hookFixture({ overrideFrameCrop: async (id, revision, seq, crop) => {
    writes.push({ id, revision, seq, crop });
    return { ok: true, writeStatus: 'applied', message: null, view: applyFrameCrop(fixture(), id, crop, seq) };
  } });
  try {
    const hook = h.renderHook();
    hook.setCrop('frame-0', { x: .2, y: .7, scale: 1.6 });
    assert.equal(writes.length, 0);
    assert.equal(await hook.flushPending(), true);
    assert.equal(writes.length, 1);
    assert.equal(h.renderHook().saveState, 'saved');
  } finally { h.restore(); }
});


test('thumbnail click switches the main spread and selected highlight together', () => {
  harness = { slots: [], cursor: 0, effects: [] };
  const filename = base + '[albumId]/album-preview-screen.tsx';
  delete require.cache[filename];
  const { AlbumPreviewScreen: Preview } = require(filename);
  const draft = fixture();
  draft.spreads.push({ ...fixture('E_2_LEFT_HERO').spreads[0], id: 'spread-2', storySpreadId: 'editorial-2' });
  const props = { spreads: [], draft, backHref: '/', editHref: '/', orderHref: '/', printHref: '/' };
  const renderPreview = () => { harness.cursor = 0; return Preview(props); };
  const children = (element) => Array.isArray(element) ? element.flatMap(children) : React.isValidElement(element) ? [element, ...children(element.props.children)] : [];
  const first = renderPreview();
  const tabs = children(first).filter((element) => element.props.role === 'tab');
  assert.equal(tabs[0].props['aria-selected'], true);
  tabs[1].props.onClick();
  const second = renderPreview();
  const nextTabs = children(second).filter((element) => element.props.role === 'tab');
  assert.equal(nextTabs[0].props['aria-selected'], false);
  assert.equal(nextTabs[1].props['aria-selected'], true);
  const html = renderToStaticMarkup(second);
  assert.equal(html.match(/data-layout="([^"]+)"/)[1], 'E_2_LEFT_HERO');
});

test('/edit loads the active draft and never rebuilds body pages from album_photos', async () => {
  const draft = applyFramePhoto(applyFrameCrop(fixture(), 'frame-0', { x: .2, y: .7, scale: 1.6 }, 1), 'frame-1', 'replacement', 1, 'https://example.com/new.jpg');
  const queried = [];
  serverHarness = { draft, loads: 0, client: {
    auth: { getUser: async () => ({ data: { user: { id: 'owner' } }, error: null }) },
    from(table) {
      queried.push(table);
      const data = table === 'albums' ? { id: 'album-1', pet_id: 'pet-1', status: 'draft', title: 'Album', period_from: '2026-01-01', period_to: '2026-02-01', cover_photo_id: null } : table === 'pets' ? { id: 'pet-1', name: 'Pet' } : null;
      const query = { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data, error: null }) };
      return query;
    },
  } };
  try {
    const filename = base + '[albumId]/edit/page.tsx';
    delete require.cache[filename];
    const Page = require(filename).default;
    const tree = await Page({ params: Promise.resolve({ petId: 'pet-1', albumId: 'album-1' }) });
    assert.equal(serverHarness.loads, 1);
    assert.ok(!queried.includes('album_photos') && !queried.includes('photo_ai_analyses'));
    assert.equal(tree.props.draft.versionId, draft.versionId);
    assert.equal(tree.props.pages[1].id, draft.spreads[0].id);
    assert.equal(tree.props.pageCount, 2);
    const html = renderToStaticMarkup(tree);
    assert.ok(html.includes('https://example.com/new.jpg') && html.includes('data-crop="0.2,0.7,1.6"'));
    assert.ok(html.includes('?spread=0'));
    assert.match(html, /class="album-edit-page-spread-link"[^>]*><span class="draft-spread-thumbnail"/);
    const link = previewRule('.album-edit-page-spread-link');
    assert.equal(link.display, 'block');
    assert.equal(link.width, '100%');
    assert.equal(link['min-width'], '0');
  } finally { serverHarness = null; }
});


// Structural contracts complement the real-browser width matrix recorded in
// task082-3-preview-main-sizing-mobile-rail.md; SSR alone cannot measure layout.
const previewCss = require('postcss').parse(fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8'));
function previewRule(selector) {
  const declarations = {};
  previewCss.walkRules(selector, (rule) => rule.walkDecls((decl) => { declarations[decl.prop] = decl.value; }));
  return declarations;
}

test('Preview main canvas has a definite width without a fixed height or a second renderer', () => {
  const html = renderToStaticMarkup(React.createElement(AlbumPreviewScreen, { spreads: [], draft: fixture(), backHref: '/', editHref: '/', orderHref: '/', printHref: '/' }));
  assert.match(html, /class="album-preview-main-canvas"[^>]*><div class="page-edit-draft/);
  const canvas = previewRule('.album-preview-main-canvas');
  assert.equal(canvas.width, '100%');
  assert.equal(canvas['min-width'], '0');
  assert.equal(canvas.height, undefined);
  assert.equal(canvas.position, undefined);
  assert.equal(canvas['max-width'], previewRule('.album-preview-stage')['max-width']);
  assert.equal(canvas['max-width'], '362px');
  assert.match(render(fixture()).main, /aspect-ratio:847 \/ 587\.432/);
});

test('Preview navigation has inset touch targets anchored to the main stage', () => {
  const stage = previewRule('.album-preview-stage');
  const arrow = previewRule('.album-preview-arrow');
  assert.equal(stage.position, 'relative');
  assert.equal(arrow.position, 'absolute');
  assert.equal(arrow.top, '50%');
  assert.ok(parseFloat(arrow.width) >= 44 && parseFloat(arrow.height) >= 44);
  assert.equal(previewRule('.album-preview-arrow-left').left, '0');
  assert.equal(previewRule('.album-preview-arrow-right').right, '0');
});

test('Preview rail reserves both end paddings and does not shrink its thumbnails', () => {
  const rail = previewRule('.album-preview-thumbs');
  assert.equal(rail['overflow-x'], 'auto');
  assert.equal(rail.padding, '2px 12px 4px');
  assert.equal(rail['scroll-padding-inline'], '12px');
  assert.equal(previewRule('.album-preview-thumb').flex, '0 0 auto');
});
