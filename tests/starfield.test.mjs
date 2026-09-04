import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync('src/scripts/starfield.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function harness(reduced = false) {
  const pending = new Map();
  const listeners = new Map();
  let nextId = 0;
  let paints = 0;
  const context = {
    clearRect: () => {
      paints += 1;
    },
    setTransform() {},
    beginPath() {},
    arc() {},
    fill() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
  };
  class Canvas {
    clientWidth = 390;
    clientHeight = 844;
    getContext() {
      return context;
    }
  }
  const canvas = new Canvas();
  const document = {
    hidden: false,
    getElementById: () => canvas,
    addEventListener: (name, callback) => listeners.set(name, callback),
  };
  const sandbox = vm.createContext({
    HTMLCanvasElement: Canvas,
    document,
    window: {
      devicePixelRatio: 1,
      matchMedia: () => ({ matches: reduced, addEventListener() {} }),
      addEventListener() {},
      setTimeout() {},
    },
    requestAnimationFrame(callback) {
      pending.set(++nextId, callback);
      return nextId;
    },
    cancelAnimationFrame(id) {
      pending.delete(id);
    },
  });
  vm.runInContext(source, sandbox);
  return {
    document,
    frame(now) {
      const callbacks = [...pending.values()];
      pending.clear();
      callbacks.forEach((callback) => {
        callback(now);
      });
    },
    visibilityChange() {
      listeners.get('visibilitychange')();
    },
    get paints() {
      return paints;
    },
    get pending() {
      return pending.size;
    },
  };
}

test('starfield paints its first frame and limits ambient redraws on a 144 Hz display', () => {
  const scene = harness();
  scene.frame(1000);
  assert.equal(scene.paints, 1);
  for (let frame = 1; frame <= 144; frame += 1) scene.frame(1000 + (frame * 1000) / 144);
  assert.ok(scene.paints >= 25 && scene.paints <= 31, `Unexpected paint count: ${scene.paints}`);
});

test('reduced motion draws once without leaving an animation loop', () => {
  const scene = harness(true);
  scene.frame(1000);
  assert.equal(scene.paints, 1);
  assert.equal(scene.pending, 0);
});

test('hidden pages stop drawing and resume when visible', () => {
  const scene = harness();
  scene.frame(1000);
  scene.document.hidden = true;
  scene.frame(1040);
  assert.equal(scene.paints, 1);
  assert.equal(scene.pending, 0);
  scene.document.hidden = false;
  scene.visibilityChange();
  scene.frame(10000);
  assert.equal(scene.paints, 2);
  assert.equal(scene.pending, 1);
});
