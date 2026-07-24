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

test('toggle controls expose their initial state', () => {
  assert.match(openingTag('home-sound'), /\baria-pressed="true"/);
  assert.match(openingTag('btn-sound'), /\baria-pressed="true"/);
  assert.match(openingTag('hint-lamp'), /\baria-disabled="false"/);
  assert.match(openingTag('hint-target'), /\baria-pressed="false"/);
});
