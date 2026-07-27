'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'storage.js'), 'utf8');

function createStore(raw, options = {}) {
  let saved = raw;
  const localStorage = {
    getItem() {
      if (options.failRead) throw new Error('storage read failed');
      return saved;
    },
    setItem(_key, value) {
      if (options.failWrite) throw new Error('storage write failed');
      saved = value;
    },
  };
  const context = { localStorage, window: {} };
  vm.runInNewContext(source, context, { filename: 'js/storage.js' });
  return {
    Store: context.window.Store,
    saved: () => saved,
  };
}

function snapshot(value) {
  return JSON.parse(JSON.stringify(value));
}

test('uses fresh defaults when there is no save', () => {
  const { Store } = createStore(null);

  assert.deepEqual(snapshot(Store.state), {
    coins: 100,
    sound: true,
    seenIntro: false,
    levels: {},
  });
});

test('falls back to defaults for unreadable or invalid JSON', () => {
  const invalidJson = createStore('{broken');
  const unreadable = createStore(null, { failRead: true });

  assert.equal(invalidJson.Store.state.coins, 100);
  assert.equal(unreadable.Store.state.coins, 100);
});

test('rejects malformed root fields', () => {
  const { Store } = createStore(JSON.stringify({
    coins: 'a lot',
    sound: 'yes',
    levels: [],
  }));

  assert.deepEqual(snapshot(Store.state), {
    coins: 100,
    sound: true,
    seenIntro: false,
    levels: {},
  });
});

test('normalizes malformed level values', () => {
  const { Store } = createStore(JSON.stringify({
    coins: 42.9,
    sound: false,
    levels: {
      0: {
        found: ['кот', 'кот', 10, ''],
        bonus: 'not-an-array',
        hinted: ['1,2', '1,2', '-1,2', 'bad'],
        done: 1,
      },
      invalid: { found: ['ignored'] },
    },
  }));

  assert.deepEqual(snapshot(Store.state), {
    coins: 42,
    sound: false,
    seenIntro: false,
    levels: {
      0: {
        found: ['кот'],
        bonus: [],
        hinted: ['1,2'],
        done: false,
        stars: 0,
      },
    },
  });
});

test('seenIntro persists only for a strict true, garbage falls back to false', () => {
  assert.equal(createStore(JSON.stringify({ seenIntro: true })).Store.state.seenIntro, true);
  assert.equal(createStore(JSON.stringify({ seenIntro: 'yes' })).Store.state.seenIntro, false);
  assert.equal(createStore(JSON.stringify({ seenIntro: 1 })).Store.state.seenIntro, false);

  const { Store } = createStore(null);
  assert.equal(Store.state.seenIntro, false);
  Store.setIntroSeen();
  assert.equal(Store.state.seenIntro, true);
});

test('migrates old level saves with missing fields', () => {
  const { Store } = createStore(JSON.stringify({
    coins: 75,
    levels: { 3: { found: ['мир'], done: true } },
  }));

  assert.deepEqual(snapshot(Store.level(3)), {
    found: ['мир'],
    bonus: [],
    hinted: [],
    done: true,
    stars: 2,
  });
  assert.deepEqual(snapshot(Store.level(4)), {
    found: [],
    bonus: [],
    hinted: [],
    done: false,
    stars: 0,
  });
});

test('migrates a safe earned star count for completed levels', () => {
  const { Store } = createStore(JSON.stringify({
    levels: {
      1: { found: ['мир'], bonus: ['рим'], hinted: [], done: true, stars: 3 },
      2: { done: true, stars: 99 },
      3: { done: false, stars: 2 },
    },
  }));

  assert.equal(Store.level(1).stars, 3);
  assert.equal(Store.level(2).stars, 2);
  assert.equal(Store.level(3).stars, 0);
  assert.equal(Store.level(4).stars, 0);
});

test('calculates completion stars from paid hints and bonus words', () => {
  const { Store } = createStore(null);

  assert.equal(Store.starsFor({ hinted: [], bonus: [] }), 2);
  assert.equal(Store.starsFor({ hinted: ['1,2'], bonus: [] }), 1);
  assert.equal(Store.starsFor({ hinted: [], bonus: ['мир'] }), 3);
  assert.equal(Store.starsFor({ hinted: ['1,2'], bonus: ['мир'] }), 2);
});

test('updates earned stars after a completed level gains a bonus word later', () => {
  const { Store, saved } = createStore(JSON.stringify({
    levels: { 0: { found: ['кот'], bonus: [], hinted: [], done: true, stars: 2 } },
  }));
  const level = Store.level(0);

  level.bonus.push('ток');
  Store.refreshStars(level);

  assert.equal(level.stars, 3);
  assert.equal(JSON.parse(saved()).levels[0].stars, 3);
});

test('coin updates stay finite, integral, and non-negative', () => {
  const { Store, saved } = createStore(JSON.stringify({ coins: 10 }));

  Store.addCoins(-25);
  assert.equal(Store.state.coins, 0);

  Store.addCoins(5.8);
  assert.equal(Store.state.coins, 5);

  Store.addCoins(Number.NaN);
  assert.equal(Store.state.coins, 5);
  assert.equal(JSON.parse(saved()).coins, 5);
});

test('storage write failures do not break state updates', () => {
  const { Store } = createStore(JSON.stringify({ coins: 10 }), { failWrite: true });

  assert.doesNotThrow(() => Store.addCoins(5));
  assert.equal(Store.state.coins, 15);
});
