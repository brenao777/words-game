'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function openingTag(id) {
  const match = html.match(new RegExp('<[^>]+\\bid="' + id + '"[^>]*>'));
  assert.ok(match, 'missing element #' + id);
  return match[0];
}

test('gameplay updates use accessible live regions', () => {
  for (const id of ['lvl-progress', 'preview', 'toast']) {
    const tag = openingTag(id);
    assert.match(tag, /\brole="status"/);
    assert.match(tag, /\baria-live="polite"/);
    assert.match(tag, /\baria-atomic="true"/);
  }

  const coach = openingTag('coach-tip');
  assert.match(coach, /\brole="note"/);
  assert.match(coach, /\baria-live="polite"/);
});

test('completion overlay exposes dialog semantics', () => {
  const tag = openingTag('overlay');

  assert.match(tag, /\brole="dialog"/);
  assert.match(tag, /\baria-modal="true"/);
  assert.match(tag, /\baria-labelledby="ov-title"/);
  assert.match(tag, /\baria-describedby="ov-stats"/);
});

test('completion overlay contains accessible stars and a reward breakdown', () => {
  const stars = openingTag('ov-stars');
  assert.match(stars, /\baria-label="Получено звёзд:"/);
  assert.match(openingTag('ov-rewards'), /\brole="list"/);
  for (const id of ['ov-grid-reward', 'ov-bonus-reward', 'ov-first-reward', 'ov-total-reward']) {
    assert.ok(html.includes('id="' + id + '"'), 'missing reward row #' + id);
  }
});

test('toggle controls expose their initial state', () => {
  assert.match(openingTag('home-sound'), /\baria-pressed="true"/);
  assert.match(openingTag('btn-sound'), /\baria-pressed="true"/);
  assert.match(openingTag('hint-lamp'), /\baria-disabled="false"/);
  assert.match(openingTag('hint-target'), /\baria-pressed="false"/);
});

test('animated coin balance remains accessible', () => {
  const coins = openingTag('game-coins');
  assert.match(coins, /\brole="status"/);
  assert.match(coins, /\baria-live="polite"/);
  assert.match(coins, /\baria-atomic="true"/);
  assert.match(coins, /\baria-label="Баланс: 0 монет"/);
  assert.match(openingTag('fx'), /\baria-hidden="true"/);
});

test('word tooltip is translucent and uses animated tap-to-dismiss states', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
  const game = fs.readFileSync(path.join(__dirname, '..', 'js', 'game.js'), 'utf8');

  assert.match(css, /\.word-tooltip\s*\{[\s\S]*background:\s*linear-gradient\([^;]*rgba\(/);
  assert.match(css, /\.word-tooltip\s*\{[\s\S]*transition:\s*opacity/);
  assert.match(css, /\.word-tooltip\.is-visible\s*\{[\s\S]*pointer-events:\s*auto/);
  assert.match(css, /\.word-tooltip\.is-hiding\s*\{/);
  assert.match(game, /function hideDefinition\(\)/);
  assert.match(game, /\$\('#word-tooltip'\)\.addEventListener\('click', hideDefinition\)/);
});
