import test from 'node:test';
import assert from 'node:assert/strict';
import * as asyncHooks from 'node:async_hooks';
import fs from 'node:fs';
import { requestModules } from './helpers/album-request-modules.mjs';

test('request measurement preserves results and thrown errors across concurrent requests', async () => {
  const { measureEditRequest, traceAlbumLoad } = requestModules({ 'node:async_hooks': asyncHooks })('lib/album-load-trace.ts');
  const error = new Error('synthetic failure');
  const results = await Promise.allSettled([
    measureEditRequest(() => traceAlbumLoad('edit.auth', async () => 42)),
    measureEditRequest(() => traceAlbumLoad('edit.album', async () => { throw error; })),
  ]);
  assert.equal(results[0].value, 42);
  assert.equal(results[1].reason, error);
});

test('instrumentation classifies transport by allowlisted table without logging request data', () => {
  const source = fs.readFileSync('lib/album-load-trace.ts', 'utf8');
  assert.match(source, /AsyncLocalStorage/);
  assert.match(source, /tables\.has\(table\)/);
  assert.match(source, /fetch\(input, init\)/);
  assert.doesNotMatch(source, /console\.(?:info|log)\([^\n]*(?:url|input|init|userId|albumId)/);
});
