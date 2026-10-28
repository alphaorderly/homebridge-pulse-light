import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import * as hap from '@homebridge/hap-nodejs';

import registerPlugin from '../dist/index.js';
import { PULSE_DURATION_MS, PulseScheduler } from '../dist/pulseScheduler.js';

function createLog() {
  const messages = { info: [], warn: [], error: [], debug: [] };
  const log = (...args) => messages.info.push(args.join(' '));
  for (const level of Object.keys(messages)) {
    log[level] = (msg) => messages[level].push(msg);
  }
  log.success = log.info;
  log.log = (_level, msg) => messages.info.push(msg);
  return { log, messages };
}

/** Builds a fake Homebridge API around the real HAP library and instantiates the accessory. */
function createAccessory(config = { name: 'Pulse Light', intervalSeconds: 30 }) {
  const api = new EventEmitter();
  api.hap = hap;
  let Accessory;
  api.registerAccessory = (name, ctor) => {
    assert.equal(name, 'PulseLight');
    Accessory = ctor;
  };
  registerPlugin(api);

  const { log, messages } = createLog();
  const accessory = new Accessory(log, { accessory: 'PulseLight', ...config }, api);
  const lightbulb = accessory.getServices().find((s) => s.UUID === hap.Service.Lightbulb.UUID);
  const on = lightbulb.getCharacteristic(hap.Characteristic.On);
  const changes = [];
  on.on('change', ({ newValue }) => changes.push([Date.now(), newValue]));

  return {
    api,
    lightbulb,
    on,
    changes,
    messages,
    launch: () => api.emit('didFinishLaunching'),
    shutdown: () => api.emit('shutdown'),
    read: () => on.handleGetRequest(),
  };
}

/**
 * Advances mocked time in 50 ms steps. A single large `mock.timers.tick` jumps the clock to the end
 * before firing, so timers scheduled from inside a callback would otherwise be stamped late or skipped.
 */
function tick(ms) {
  for (let left = ms; left > 0; left -= 50) {
    mock.timers.tick(Math.min(50, left));
  }
}
const nextImmediate = () => new Promise((resolve) => setImmediate(resolve));

/** Expected [time, value] change events for `count` pulses at `intervalMs`. */
function expectedPulses(intervalMs, count) {
  const out = [];
  for (let k = 1; k <= count; k++) {
    out.push([k * intervalMs, true], [k * intervalMs + PULSE_DURATION_MS, false]);
  }
  return out;
}

beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  // Drive the scheduler's monotonic clock from the mocked Date.
  mock.method(performance, 'now', () => Date.now());
});

afterEach(() => {
  mock.timers.reset();
  mock.restoreAll();
});

describe('pulse cycle (30 s)', () => {
  test('starts OFF and stays OFF until the first interval elapses', async () => {
    const t = createAccessory();
    assert.equal(t.on.value, false);
    t.launch();
    assert.equal(await t.read(), false);

    tick(29_999);
    assert.equal(t.on.value, false);
    assert.equal(await t.read(), false);
    assert.deepEqual(t.changes, []);
    t.shutdown();
  });

  test('turns ON at 30 s, OFF at 30.5 s, ON again at 60 s', async () => {
    const t = createAccessory();
    t.launch();

    tick(30_000);
    assert.equal(t.on.value, true, 'ON at 30 s');
    assert.equal(await t.read(), true);

    tick(499);
    assert.equal(t.on.value, true, 'still ON at 30.499 s');

    tick(1);
    assert.equal(t.on.value, false, 'OFF at 30.5 s');
    assert.equal(await t.read(), false);

    tick(29_499);
    assert.equal(t.on.value, false, 'still OFF at 59.999 s');

    tick(1);
    assert.equal(t.on.value, true, 'ON at 60 s');

    tick(500);
    assert.equal(t.on.value, false, 'OFF at 60.5 s');

    tick(29_500);
    assert.equal(t.on.value, true, 'ON at 90 s');
    tick(500);

    assert.deepEqual(t.changes, expectedPulses(30_000, 3));
    t.shutdown();
  });

  test('does not pulse before Homebridge finishes launching', () => {
    const t = createAccessory();
    tick(120_000);
    assert.deepEqual(t.changes, []);
  });
});

describe('other intervals', () => {
  for (const seconds of [1, 5, 61]) {
    test(`${seconds} s interval pulses on a fixed grid without drift`, () => {
      const t = createAccessory({ name: 'Fast Pulse', intervalSeconds: seconds });
      t.launch();
      tick(seconds * 1000 * 10 + PULSE_DURATION_MS);
      assert.deepEqual(t.changes, expectedPulses(seconds * 1000, 10));
      t.shutdown();
    });
  }
});

describe('config validation', () => {
  const invalid = [0, -5, 2.5, 86_401, 'abc', '', null, true, {}, []];
  for (const intervalSeconds of invalid) {
    test(`intervalSeconds=${JSON.stringify(intervalSeconds)} logs an error and falls back to 30 s`, () => {
      const t = createAccessory({ name: 'Bad', intervalSeconds });
      assert.equal(t.messages.error.length, 1);
      assert.match(t.messages.error[0], /intervalSeconds/);
      t.launch();
      tick(30_000);
      assert.deepEqual(t.changes, [[30_000, true]]);
      t.shutdown();
    });
  }

  test('missing intervalSeconds warns and falls back to 30 s', () => {
    const t = createAccessory({ name: 'Missing' });
    assert.equal(t.messages.warn.length, 1);
    t.launch();
    tick(30_000);
    assert.equal(t.on.value, true);
    t.shutdown();
  });

  test('numeric string intervalSeconds is accepted', () => {
    const t = createAccessory({ name: 'Str', intervalSeconds: '10' });
    assert.equal(t.messages.error.length, 0);
    t.launch();
    tick(10_000);
    assert.equal(t.on.value, true);
    t.shutdown();
  });

  test('missing or blank name falls back to "Pulse Light"', () => {
    for (const name of [undefined, '', '   ', 42]) {
      const t = createAccessory({ name, intervalSeconds: 5 });
      assert.equal(t.lightbulb.displayName, 'Pulse Light');
      assert.equal(t.messages.warn.length, 1);
    }
  });

  test('accessory name is applied to the Lightbulb service', () => {
    const t = createAccessory({ name: '  Heartbeat  ', intervalSeconds: 5 });
    assert.equal(t.lightbulb.displayName, 'Heartbeat');
  });
});

describe('shutdown', () => {
  test('clears the timer and turns OFF when shut down mid-pulse', async () => {
    const t = createAccessory();
    t.launch();
    tick(30_000);
    assert.equal(t.on.value, true);

    t.shutdown();
    assert.equal(t.on.value, false);
    assert.equal(await t.read(), false);

    const before = t.changes.length;
    tick(600_000);
    assert.equal(t.changes.length, before, 'no pulses after shutdown');
  });

  test('clears the timer when shut down while OFF', () => {
    const t = createAccessory();
    t.launch();
    tick(10_000);
    t.shutdown();
    tick(600_000);
    assert.deepEqual(t.changes, []);
  });
});

describe('duplicate timers and overlapping pulses', () => {
  test('repeated launch events do not create extra timers', () => {
    const t = createAccessory();
    t.launch();
    tick(10_000);
    t.launch();
    t.launch();
    tick(50_500);
    assert.deepEqual(t.changes, expectedPulses(30_000, 2));
    t.shutdown();
  });

  test('event-loop stall skips missed slots instead of firing pulses back to back', () => {
    let stall = 0;
    const events = [];
    const scheduler = new PulseScheduler(30_000, (on) => events.push([Date.now() + stall, on]), () => Date.now() + stall);
    scheduler.start();

    tick(30_000); // ON at 30 s
    stall += 75_000; // the process freezes for 75 s while the light is ON
    tick(500); // OFF fires late, at 105.5 s on the monotonic clock
    tick(30_000); // advance well past the next grid slot

    assert.deepEqual(events, [
      [30_000, true],
      [105_500, false],
      [120_000, true],
      [120_500, false],
    ]);
    scheduler.stop();
  });

  test('ON and OFF strictly alternate under random timer lateness', () => {
    let stall = 0;
    const values = [];
    const scheduler = new PulseScheduler(1_000, (on) => values.push(on), () => Date.now() + stall);
    scheduler.start();
    let seed = 1;
    for (let i = 0; i < 2_000; i++) {
      seed = (seed * 16807) % 2147483647;
      stall += seed % 1_500;
      tick(100);
    }
    scheduler.stop();
    assert.ok(values.length > 10);
    values.forEach((v, i) => assert.equal(v, i % 2 === 0, `event ${i} breaks ON/OFF alternation`));
  });

  test('start() on a running scheduler is a no-op', () => {
    const events = [];
    const scheduler = new PulseScheduler(1_000, (on) => events.push(on));
    scheduler.start();
    tick(500);
    scheduler.start();
    tick(1_000);
    assert.deepEqual(events, [true, false]);
    scheduler.stop();
  });
});

describe('manual changes from the Home app', () => {
  test('turning ON manually is reverted and the schedule is unchanged', async () => {
    const t = createAccessory();
    t.launch();
    tick(10_000);

    await t.on.handleSetRequest(true);
    await nextImmediate();
    assert.equal(t.on.value, false);
    assert.equal(await t.read(), false);

    tick(20_000);
    assert.equal(t.on.value, true, 'pulse still fires at 30 s');
    tick(500);
    assert.equal(t.on.value, false);
    t.shutdown();
  });

  test('turning OFF during a pulse is reverted and the pulse ends on time', async () => {
    const t = createAccessory();
    t.launch();
    tick(30_000);

    await t.on.handleSetRequest(false);
    await nextImmediate();
    assert.equal(t.on.value, true);

    tick(500);
    assert.equal(t.on.value, false);
    tick(29_500);
    assert.equal(t.on.value, true, 'next pulse at 60 s');
    t.shutdown();
  });
});
