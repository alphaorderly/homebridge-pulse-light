import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import * as hap from '@homebridge/hap-nodejs';

import registerPlugin from '../dist/index.js';
import { PulseScheduler } from '../dist/pulseScheduler.js';

const SINGLE_PRESS = hap.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS;

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
  const button = accessory.getServices().find((s) => s.UUID === hap.Service.StatelessProgrammableSwitch.UUID);
  const switchEvent = button.getCharacteristic(hap.Characteristic.ProgrammableSwitchEvent);
  const presses = [];
  switchEvent.on('change', ({ newValue, reason }) => {
    assert.equal(reason, 'event', 'presses must be sent as event notifications');
    presses.push([Date.now(), newValue]);
  });

  return {
    accessory,
    button,
    switchEvent,
    presses,
    messages,
    launch: () => api.emit('didFinishLaunching'),
    shutdown: () => api.emit('shutdown'),
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

/** Expected [time, value] press events for `count` pulses at `intervalMs`. */
function expectedPresses(intervalMs, count) {
  return Array.from({ length: count }, (_, i) => [(i + 1) * intervalMs, SINGLE_PRESS]);
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

describe('accessory', () => {
  test('exposes a single-press-only Stateless Programmable Switch and no lightbulb', () => {
    const t = createAccessory();
    assert.ok(t.button);
    assert.equal(t.accessory.getServices().some((s) => s.UUID === hap.Service.Lightbulb.UUID), false);
    assert.deepEqual(t.switchEvent.props.validValues, [SINGLE_PRESS]);
    assert.equal(t.switchEvent.props.minValue, SINGLE_PRESS);
    assert.equal(t.switchEvent.props.maxValue, SINGLE_PRESS);
  });

  test('reads of the button event return null, as HAP requires', async () => {
    const t = createAccessory();
    t.launch();
    tick(30_000);
    assert.equal(await t.switchEvent.handleGetRequest(), null);
    t.shutdown();
  });

  test('accessory name is applied to the button service', () => {
    const t = createAccessory({ name: '  Heartbeat  ', intervalSeconds: 5 });
    assert.equal(t.button.displayName, 'Heartbeat');
  });
});

describe('press cycle (30 s)', () => {
  test('does not press until the first interval elapses', () => {
    const t = createAccessory();
    t.launch();
    tick(29_999);
    assert.deepEqual(t.presses, []);
    t.shutdown();
  });

  test('presses once at 30 s, 60 s and 90 s', () => {
    const t = createAccessory();
    t.launch();
    tick(30_000);
    assert.deepEqual(t.presses, expectedPresses(30_000, 1));
    tick(29_999);
    assert.equal(t.presses.length, 1, 'no extra press before 60 s');
    tick(1);
    tick(30_000);
    assert.deepEqual(t.presses, expectedPresses(30_000, 3));
    t.shutdown();
  });

  test('does not press before Homebridge finishes launching', () => {
    const t = createAccessory();
    tick(120_000);
    assert.deepEqual(t.presses, []);
  });
});

describe('other intervals', () => {
  for (const seconds of [1, 2.5, 5, 61]) {
    test(`${seconds} s interval presses on a fixed grid without drift`, () => {
      const t = createAccessory({ name: 'Fast Pulse', intervalSeconds: seconds });
      assert.equal(t.messages.error.length, 0);
      t.launch();
      tick(seconds * 1000 * 10);
      assert.deepEqual(t.presses, expectedPresses(seconds * 1000, 10));
      t.shutdown();
    });
  }
});

describe('config validation', () => {
  const invalid = [0, 0.5, -5, 86_401, 'abc', '', 'NaN', null, true, {}, []];
  for (const intervalSeconds of invalid) {
    test(`intervalSeconds=${JSON.stringify(intervalSeconds)} logs an error and falls back to 30 s`, () => {
      const t = createAccessory({ name: 'Bad', intervalSeconds });
      assert.equal(t.messages.error.length, 1);
      assert.match(t.messages.error[0], /intervalSeconds/);
      t.launch();
      tick(30_000);
      assert.deepEqual(t.presses, expectedPresses(30_000, 1));
      t.shutdown();
    });
  }

  test('missing intervalSeconds warns and falls back to 30 s', () => {
    const t = createAccessory({ name: 'Missing' });
    assert.equal(t.messages.warn.length, 1);
    t.launch();
    tick(30_000);
    assert.equal(t.presses.length, 1);
    t.shutdown();
  });

  test('numeric string intervalSeconds is accepted', () => {
    const t = createAccessory({ name: 'Str', intervalSeconds: '10' });
    assert.equal(t.messages.error.length, 0);
    t.launch();
    tick(10_000);
    assert.equal(t.presses.length, 1);
    t.shutdown();
  });

  test('missing or blank name falls back to "Pulse Light"', () => {
    for (const name of [undefined, '', '   ', 42]) {
      const t = createAccessory({ name, intervalSeconds: 5 });
      assert.equal(t.button.displayName, 'Pulse Light');
      assert.equal(t.messages.warn.length, 1);
    }
  });

  test('a leftover 1.x onSeconds warns but does not change the schedule', () => {
    const t = createAccessory({ name: 'Legacy', intervalSeconds: 5, onSeconds: 2 });
    assert.equal(t.messages.error.length, 0);
    assert.equal(t.messages.warn.length, 1);
    assert.match(t.messages.warn[0], /onSeconds/);
    t.launch();
    tick(10_000);
    assert.deepEqual(t.presses, expectedPresses(5_000, 2));
    t.shutdown();
  });
});

describe('shutdown', () => {
  test('clears the timer', () => {
    const t = createAccessory();
    t.launch();
    tick(30_000);
    t.shutdown();
    const before = t.presses.length;
    tick(600_000);
    assert.equal(t.presses.length, before, 'no presses after shutdown');
  });
});

describe('duplicate timers and stacked presses', () => {
  test('repeated launch events do not create extra timers', () => {
    const t = createAccessory();
    t.launch();
    tick(10_000);
    t.launch();
    t.launch();
    tick(50_000);
    assert.deepEqual(t.presses, expectedPresses(30_000, 2));
    t.shutdown();
  });

  test('event-loop stall skips missed slots instead of pressing back to back', () => {
    let stall = 0;
    const times = [];
    const scheduler = new PulseScheduler(30_000, () => times.push(Date.now() + stall), () => Date.now() + stall);
    scheduler.start();

    tick(30_000); // press at 30 s
    stall += 75_000; // the process freezes for 75 s
    tick(30_000); // the next timer fires late, at 135 s on the monotonic clock
    tick(15_000); // next grid slot is 150 s

    assert.deepEqual(times, [30_000, 135_000, 150_000]);
    scheduler.stop();
  });

  test('start() on a running scheduler is a no-op', () => {
    let count = 0;
    const scheduler = new PulseScheduler(1_000, () => count++);
    scheduler.start();
    tick(500);
    scheduler.start();
    tick(1_000);
    assert.equal(count, 1);
    scheduler.stop();
  });
});
