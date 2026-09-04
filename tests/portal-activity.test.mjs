import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

async function harness() {
  let now = 1000;
  let session = { accessToken: 'first-session', user: { id: 'rick', balance: 5000 } };
  const samples = [];
  const grants = [];
  const toasts = [];
  let respond = async (sample) => ({
    cycleId: 'cycle',
    nextSequence: sample.sequence + 1,
    progress: 0.5,
    payout: 0,
    balance: 5000,
  });
  class ApiError extends Error {}
  const context = vm.createContext({
    performance: { now: () => now },
    document: { hidden: false },
  });
  const modules = {
    'services/portalTripApi': {
      startPortalActivity: async () => ({
        cycleId: 'cycle',
        nextSequence: 1,
        progress: 0,
        payout: 0,
        balance: 5000,
      }),
      reportPortalActivity: async (sample) => {
        samples.push({ ...sample });
        return respond(sample);
      },
    },
    'services/portalTripApiError': {
      getApiErrorView: () => ({ message: 'Try again' }),
      PortalTripApiError: ApiError,
    },
    'stores/portalPlayStore': {
      portalPlayStore: {
        getState: () => ({ recordHelp: () => {}, noteGrant: (payout) => grants.push(payout) }),
      },
    },
    'stores/sessionStore': {
      getActiveSession: () => session,
      sessionStore: {
        getState: () => ({
          setBalance: (balance) => {
            session.user.balance = balance;
          },
        }),
      },
    },
    './travel-planner/notifications': { showToast: (...args) => toasts.push(args) },
  };
  const source = ts.transpileModule(
    readFileSync(new URL('../src/scripts/portal-activity.ts', import.meta.url), 'utf8'),
    {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    },
  ).outputText;
  const module = new vm.SourceTextModule(source, { context });
  await module.link(
    (name) =>
      new vm.SyntheticModule(
        Object.keys(modules[name]),
        function () {
          for (const [key, value] of Object.entries(modules[name])) this.setExport(key, value);
        },
        { context },
      ),
  );
  await module.evaluate();
  const tracker = new module.namespace.PortalActivityTracker();
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  return {
    tracker,
    samples,
    grants,
    toasts,
    session: () => session,
    switchUser: () => {
      session = { accessToken: 'second-session', user: { id: 'morty', balance: 5000 } };
    },
    respond: (fn) => {
      respond = fn;
    },
    move: (delta = 0.1) => {
      now += 100;
      tracker.move(delta, now);
    },
    tick: async (elapsed = 0) => {
      now += elapsed;
      tracker.tick(now);
      await flush();
    },
    hide: () => {
      context.document.hidden = true;
    },
    show: () => {
      context.document.hidden = false;
    },
    flush,
  };
}

test('stationary pointer and a single pass send no active time or money', async () => {
  const h = await harness();
  await h.tick();
  h.move();
  await h.tick(1000);
  assert.equal(h.samples[0].activeMs, 0);
  assert.equal(h.samples[0].distance, 0);
  assert.deepEqual(Object.keys(h.samples[0]).sort(), [
    'activeMs',
    'cycleId',
    'distance',
    'sequence',
  ]);
  assert.equal(h.grants.length, 0);
});

test('sustained movement sends measured deltas and credits only the server response', async () => {
  const h = await harness();
  h.respond(async () => ({
    cycleId: 'cycle',
    nextSequence: 2,
    progress: 1,
    payout: 731,
    balance: 5731,
  }));
  await h.tick();
  for (let i = 0; i < 11; i++) h.move();
  await h.tick();
  assert.equal(h.samples[0].activeMs, 1000);
  assert.ok(h.samples[0].distance > 0.9);
  assert.deepEqual(h.grants, [731]);
  assert.equal(h.session().user.balance, 5731);
  await h.tick(2000);
  assert.equal(h.samples.length, 1);
});

test('lost response retries the exact sample and notifies the user once', async () => {
  const h = await harness();
  h.respond(async () => {
    throw new Error('offline');
  });
  await h.tick();
  for (let i = 0; i < 11; i++) h.move();
  await h.tick();
  h.move();
  await h.tick(1000);
  assert.deepEqual(h.samples[0], h.samples[1]);
  assert.equal(h.toasts.length, 1);
  h.respond(async () => ({
    cycleId: 'cycle',
    nextSequence: 2,
    progress: 1,
    payout: 731,
    balance: 5731,
  }));
  await h.tick(1000);
  assert.deepEqual(h.grants, [731]);
});

test('response from the old session cannot overwrite a new user balance', async () => {
  const h = await harness();
  let complete;
  h.respond(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  await h.tick();
  await h.tick(1000);
  h.switchUser();
  complete({ cycleId: 'cycle', nextSequence: 2, progress: 1, payout: 731, balance: 5731 });
  await h.flush();
  assert.equal(h.session().user.balance, 5000);
  assert.equal(h.grants.length, 0);
});

test('hidden page discards unsent movement', async () => {
  const h = await harness();
  await h.tick();
  for (let i = 0; i < 5; i++) h.move();
  h.hide();
  await h.tick(1000);
  h.show();
  await h.tick();
  assert.equal(h.samples[0].activeMs, 0);
  assert.equal(h.samples[0].distance, 0);
});

async function motion() {
  const source = ts.transpileModule(
    readFileSync(new URL('../src/scripts/portal-motion.ts', import.meta.url), 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } },
  ).outputText;
  const module = new vm.SourceTextModule(source);
  await module.link(() => {
    throw new Error('Unexpected import');
  });
  await module.evaluate();
  return module.namespace;
}

test('portal recovery is continuous and does not jump or overshoot', async () => {
  const { smoothPortalLevel: smooth } = await motion();
  let level = 50;
  const first = smooth(level, 95, 1000 / 60);
  assert.ok(first > 50 && first < 52);
  for (let i = 0; i < 180; i++) {
    const next = smooth(level, 95, 1000 / 60);
    assert.ok(next >= level && next <= 95);
    level = next;
  }
  assert.ok(level > 94);
  assert.equal(smooth(level, 50, 0), level);
});

test('portal recovery has the same duration at 30, 60 and 144 Hz', async () => {
  const { smoothPortalLevel: smooth } = await motion();
  const levels = [30, 60, 144].map((fps) => {
    let level = 50;
    for (let i = 0; i < fps; i++) level = smooth(level, 95, 1000 / fps);
    return level;
  });
  assert.ok(Math.max(...levels) - Math.min(...levels) < 0.000001);
});

test('each failure can vary in depth and speed without dropping the level abruptly', async () => {
  const { pickPortalFall, smoothPortalLevel } = await motion();
  const deep = pickPortalFall(() => 0);
  const shallow = pickPortalFall(() => 1);
  assert.equal(deep.floor, 38);
  assert.equal(shallow.floor, 62);
  assert.equal(deep.responseMs, 900);
  assert.equal(shallow.responseMs, 1600);
  for (const fall of [deep, shallow]) {
    const first = smoothPortalLevel(95, fall.floor, 1000 / 60, fall.responseMs);
    assert.ok(first > 93 && first < 95);
    let level = 95;
    for (let i = 0; i < 300; i++) {
      const next = smoothPortalLevel(level, fall.floor, 1000 / 60, fall.responseMs);
      assert.ok(next <= level && next >= fall.floor);
      level = next;
    }
  }
});
