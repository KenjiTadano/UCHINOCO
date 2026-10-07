import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { pathToFileURL } from 'node:url';

const repo = new URL('../', import.meta.url).pathname;
const source = (await readFile(`${repo}/lib/album-new-photo-suggestions.ts`, 'utf8'))
  .replace('import "server-only";', '')
  .replace('"./album-new-photo-suggestion-policy"', JSON.stringify(pathToFileURL(`${repo}/lib/album-new-photo-suggestion-policy.ts`).href));
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { findNewPhotoSuggestion } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

function client(failure, legacy = false) {
  const calls = [];
  const responses = {
    albums: [{ data: { id: 'album', pet_id: 'a', status: 'draft', period_from: '2026-09-01', period_to: '2026-10-01' } }],
    album_pets: [{ data: [{ pet_id: 'b' }] }],
    album_draft_versions: [{ data: { id: 'draft', status: 'editing', created_at: '2026-09-01', generation_metadata: legacy ? {} : { generation_photo_ids: ['old'] } } }],
    album_analytics_events: [{ data: null }, { data: null }],
    orders: [{ data: null }], pets: [{ data: [{ id: 'a' }, { id: 'b' }] }],
    album_draft_spreads: [{ data: [{ id: 'spread' }] }], album_draft_frames: [{ data: [{ ai_photo_id: 'old' }] }],
    photos: [{ data: [{ id: 'old', pet_id: 'a', created_at: '2026-08-01' }, { id: 'new', pet_id: 'b', created_at: '2026-09-02' }] }],
    album_photos: [{ data: [] }], photo_analysis_results: [{ data: [] }],
  };
  const counters = {};
  return { calls, from(table) {
    const ordinal = counters[table] = (counters[table] ?? 0) + 1;
    const result = failure === `${table}:${ordinal}` ? { data: null, error: { code: 'failure' } } : responses[table].shift();
    let builder;
    builder = new Proxy({}, { get(_, method) {
      if (method === 'then') return (resolve) => resolve(result);
      return (...args) => { calls.push([table, method, args]); return builder; };
    } });
    return builder;
  } };
}
const input = { albumId: 'album', routePetId: 'a', userId: 'owner' };

test('multi-pet detection uses full scope, excludes generation IDs, and performs no writes', async () => {
  const db = client();
  const suggestion = await findNewPhotoSuggestion(db, input);
  assert.deepEqual(suggestion.candidates.map(p => p.id), ['new']);
  assert.equal(suggestion.candidates[0].bestShotScore, null);
  assert.ok(db.calls.some(([table, method, args]) => table === 'photos' && method === 'in' && args[0] === 'pet_id' && args[1].join() === 'a,b'));
  assert.ok(db.calls.every(([, method]) => !['insert', 'update', 'delete', 'upsert'].includes(method)));
});
for (const failure of ['albums:1', 'album_pets:1', 'album_draft_versions:1', 'album_analytics_events:1', 'orders:1', 'pets:1', 'photos:1', 'album_photos:1', 'album_analytics_events:2']) {
  test(`detection fails closed on ${failure}`, async () => {
    assert.equal(await findNewPhotoSuggestion(client(failure), input), null);
  });
}
for (const failure of ['album_draft_spreads:1', 'album_draft_frames:1']) {
  test(`legacy detection fails closed on ${failure}`, async () => {
    assert.equal(await findNewPhotoSuggestion(client(failure, true), input), null);
  });
}
test('analysis lookup failure preserves unevaluated state without inventing a score', async () => {
  const suggestion = await findNewPhotoSuggestion(client('photo_analysis_results:1'), input);
  assert.equal(suggestion.candidates[0].bestShotScore, null);
});
