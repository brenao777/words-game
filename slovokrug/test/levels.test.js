'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadLevels() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'levels.data.js'), 'utf8');
  const context = { window: {} };
  vm.runInNewContext(source, context, { filename: 'js/levels.data.js' });
  return context.window.SK_LEVELS;
}

test('level route follows the planned difficulty curve', () => {
  const levels = loadLevels();
  const expectedWords = [
    ...Array(12).fill(4),
    ...Array(8).fill(5),
    ...Array(16).fill(6),
    ...Array(7).fill(7),
    ...Array(4).fill(8),
    ...Array(3).fill(9),
  ];

  assert.equal(levels.length, 50);
  assert.deepEqual(Array.from(levels, level => level.w.length), expectedWords);
  assert.equal(new Set(levels.map(level => level.w[0][0])).size, 50, 'base words must be unique');
});

test('words do not become repetitive across levels', () => {
  const levels = loadLevels();
  const uses = new Map();

  levels.forEach((level, levelIndex) => {
    level.w.forEach(([word]) => {
      const occurrences = uses.get(word) || [];
      occurrences.push(levelIndex);
      uses.set(word, occurrences);
    });
  });

  const placements = levels.reduce((sum, level) => sum + level.w.length, 0);
  const repeatPlacements = [...uses.values()].reduce((sum, occurrences) => sum + occurrences.length - 1, 0);

  assert.ok(uses.size / placements >= 0.7, 'at least 70% of placed words should be unique');
  assert.ok(repeatPlacements <= 90, 'the route should contain no more than 90 repeated placements');

  for (const [word, occurrences] of uses) {
    const maxUses = word.length === 3 ? 3 : 2;
    assert.ok(occurrences.length <= maxUses, `${word} is used too often`);
    for (let i = 1; i < occurrences.length; i++) {
      assert.ok(
        occurrences[i] - occurrences[i - 1] >= 8,
        `${word} repeats too soon`,
      );
    }
  }
});

test('grid vocabulary keeps a light family-friendly tone', () => {
  const levels = loadLevels();
  const blocked = new Set([
    'ангина', 'астма', 'болезнь', 'бронхит', 'вывих', 'грыжа', 'диабет',
    'диагноз', 'изжога', 'инфаркт', 'инсульт', 'кариес', 'наркоз', 'простуда',
    'травма', 'укол',
  ]);

  for (const level of levels) {
    for (const [word] of level.w) assert.equal(blocked.has(word), false, word);
  }
});
