'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.join(__dirname, '..', '..');

test('GitHub Pages entry point redirects to the isolated game directory', () => {
  const html = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');

  assert.match(html, /url=slovokrug\//);
  assert.match(html, /location\.replace\('slovokrug\/'/);
  assert.equal(fs.existsSync(path.join(repoRoot, '.nojekyll')), true);
});
