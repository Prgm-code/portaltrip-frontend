import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const exports = {};
vm.runInNewContext(
  ts.transpileModule(readFileSync('src/scripts/portal-pointer.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  { exports },
);

function harness() {
  const listeners = new Map();
  const captures = new Set();
  const moves = [];
  let resets = 0;
  const lifecycle = new AbortController();
  const host = {
    dataset: { bosons: 'needed' },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 200, bottom: 200 }),
    setPointerCapture: (id) => captures.add(id),
    hasPointerCapture: (id) => captures.has(id),
    releasePointerCapture: (id) => captures.delete(id),
  };
  exports.bindPortalPointer(
    host,
    {
      move: (x, y) => {
        moves.push([x, y]);
      },
      reset: () => {
        resets += 1;
      },
    },
    lifecycle.signal,
  );
  return {
    host,
    captures,
    moves,
    lifecycle,
    get resets() {
      return resets;
    },
    send(type, overrides = {}) {
      listeners.get(type)?.({
        isTrusted: true,
        pointerType: 'touch',
        isPrimary: true,
        pointerId: 1,
        clientX: 100,
        clientY: 100,
        ...overrides,
      });
    },
  };
}

test('touch requires a pressed primary finger and captures the gesture', () => {
  const h = harness();
  h.send('pointermove');
  assert.equal(h.moves.length, 0);
  h.send('pointerdown');
  assert.ok(h.captures.has(1));
  h.send('pointermove', { clientX: 120 });
  h.send('pointerdown', { pointerId: 2, isPrimary: false });
  h.send('pointermove', { pointerId: 2 });
  assert.deepEqual(h.moves, [
    [100, 100],
    [120, 100],
  ]);
  h.send('pointerup');
  assert.equal(h.captures.size, 0);
  h.send('pointermove');
  assert.equal(h.moves.length, 2);
});

test('a stable portal leaves touch scrolling alone; mouse hover still works', () => {
  const h = harness();
  h.host.dataset.bosons = '';
  h.send('pointerdown');
  h.send('pointermove');
  assert.equal(h.captures.size, 0);
  assert.equal(h.moves.length, 0);
  h.send('pointermove', { pointerType: 'mouse' });
  assert.equal(h.moves.length, 1);
});

test('movement outside the portal is ignored and cancellation releases capture', () => {
  const h = harness();
  h.send('pointerdown');
  h.send('pointermove', { clientX: 250 });
  assert.equal(h.moves.length, 1);
  assert.equal(h.resets, 2);
  h.send('pointercancel');
  assert.equal(h.captures.size, 0);
  h.send('pointermove');
  assert.equal(h.moves.length, 1);
});

test('untrusted events earn no activity and navigation releases a held finger', () => {
  const h = harness();
  h.send('pointerdown', { isTrusted: false });
  h.send('pointermove', { pointerType: 'mouse', isTrusted: false });
  assert.equal(h.moves.length, 0);
  h.send('pointerdown');
  h.lifecycle.abort();
  assert.equal(h.captures.size, 0);
});
