import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getPhotoPetOptions } from '../lib/photo-pets.ts';

const pets = ['primary', 'manual', 'ai', 'available'].map(id => ({ id, name: id, avatarUrl: null }));
const relation = (pet_id, source, confirmed_by_user) => ({pet_id, pet_name: pet_id, source, confirmed_by_user, confidence: null});

test('registration is never listed as appearing or available, including confirmed primary', () => {
  for (const confirmed of [false, true]) {
    const result = getPhotoPetOptions('primary', [relation('primary', 'primary', confirmed)], pets);
    assert.deepEqual(result.appearing, []);
    assert.ok(result.candidates.every(pet => pet.id !== 'primary'));
  }
});
test('only confirmed manual relations appear; every existing relation is excluded from candidates', () => {
  const result = getPhotoPetOptions('primary', [relation('manual','user',true), relation('ai','ai',true)], pets);
  assert.deepEqual(result.appearing.map(pet => pet.id), ['manual']);
  assert.deepEqual(result.candidates.map(pet => pet.id), ['available']);
});
test('unconfirmed relations remain hidden and unavailable; foreign relation names are not projected', () => {
  const result = getPhotoPetOptions('primary', [relation('manual','user',false), relation('ai','ai',false), relation('foreign','user',true)], pets);
  assert.deepEqual(result.appearing, []);
  assert.deepEqual(result.candidates.map(pet => pet.id), ['available']);
});
test('removal returns the pet to candidates', () => {
  const result = getPhotoPetOptions('primary', [], pets);
  assert.deepEqual(result.appearing, []);
  assert.deepEqual(result.candidates.map(pet => pet.id), ['manual','ai','available']);
});
